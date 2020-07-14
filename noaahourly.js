Module.register("noaahourly", {

    defaults: {
        lat: 0,
        lon: 0,
        notificationsOnly: true,
        units: config.units,
        language: config.language,
        twentyFourHourTime: true,
        showCurrentWeather: true,
        showTextSummary: true,
        showPrecipitationPossibilityInRow: true,
        showDayInRow: true,
        showIconInRow: true,
        fadeForecast: true,
        updateInterval: 10 * 60 * 1000, // every 5 minutes
        animationSpeed: 1000,
        initialLoadDelay: 0, // 0 seconds delay
        retryDelay: 2500,
        maxHoursForecast: 8,   // maximum number of hours to show in forecast
        skipHours: 0,
        debug: false
    },

    getTranslations: function () {
        return false;
    },

    getScripts: function () {
        return [
        'jsonp.js',
        'moment.js'
        ];
    },

    getStyles: function () {
        return ["weather-icons.css", "noaahourly.css"];
    },

    start: function () {
        Log.info("Starting module: " + this.name);

        if ( this.config.notificationsOnly ){
          Log.info("This module is in notifications-only mode. We will wait for hourly data from the noaacurrent module.");
          return;
      }

      this.scheduleUpdate(this.config.initialLoadDelay);
    },

    updateWeather: function () {
      // var url = this.config.apiBase+'/'+this.config.apiKey+'/'+this.config.latitude+','+this.config.longitude+'?units='+units+'&lang='+this.config.language;
      // if (this.config.data) {
      //     // for debugging
      //     this.processWeather(this.config.data);
      // } else {
      //     getJSONP(url, this.processWeather.bind(this), this.processWeatherError.bind(this));
      // }
    },

    findPrecip: (hour, probabilities) => {
        var start = Date.parse(hour.startTime);
        var probability = probabilities.find((p)=>p.start <= start && p.end >= start);
        if ( probability != null ){
            hour.probability = probability.value;
        }
        else{
            hour.probability = 0;
        }
    },

    processWeather: function (data) {
        Log.log("Processing weather data...");

        this.weatherData = {hourly: data.hourly.properties.periods};

        if(data.current != null && 
            data.current.properties != null &&
            data.current.properties.probabilityOfPrecipitation != null && 
            data.current.properties.probabilityOfPrecipitation.values != null){

            var precipPeriods = data.current.properties.probabilityOfPrecipitation.values;
            precipPeriods.forEach((period)=>{
                period.start = Date.parse(period.validTime.split('/')[0]);

                var hours = period.validTime.split('/')[1];
                period.hours = parseInt(hours.slice(2, hours.length-1));

                period.end = period.start + period.hours * 60 * 60 * 1000;
            });

            this.weatherData.hourly.forEach((hour)=>{
                this.findPrecip(hour, precipPeriods);
            });
        }

        this.loaded = true;
        this.updateDom(this.config.animationSpeed);

        this.scheduleUpdate();
    },

    processWeatherError: function (error) {
        if (this.config.debug) {
            console.log('process weather error', error);
        }

        // try later
        this.scheduleUpdate();
    },

    notificationReceived: function(notification, payload, sender) {
        switch(notification) {
            case "DOM_OBJECTS_CREATED":
                break;
            case "NOAAWEATHER_HOURLY_DATA":
                this.processWeather(payload);
                Log.info("Got weather data in notification!");
                break;
        }
    },

    getDom: function() {
        var wrapper = document.createElement("div");

        if (!this.loaded) {
            wrapper.innerHTML = this.translate('LOADING');
            wrapper.className = "dimmed light small";
            return wrapper;
        }

        wrapper.appendChild(this.renderWeatherForecast());

        return wrapper;
    },

    // Get current day from time
    getDayFromTime: function (time) {
        var dt = new Date(Date.parse(time));
        return moment.weekdaysShort(dt.getDay());
    },

    // Get current hour from time
    // Depending on config returns either
    //  - 23:00 - 24 hour format
    //  - 11pm  - 12 hour format
    getHourFromTime: function (time) {
        var dt = new Date(Date.parse(time));
        var hour = dt.getHours();
        if (this.config.twentyFourHourTime) {
            return hour + ":00";
        }
        else {
            var twentyFourHourFormat = "am";
            if (hour > 11) {
                twentyFourHourFormat = "pm";
            }
            hour = hour % 12;
            hour = (hour == 0) ? 12 : hour;
            return hour + twentyFourHourFormat;
        }
    },

    classifyWeather: (hour)=>{
        var prefix = hour.isDaytime?"wi-day":"wi-night";

        var classifier = hour.icon.split("/");
        classifier = classifier[classifier.length-1].split("?")[0].split(",")[0];

        Log.log("Weather classifier is: " + classifier);

        var conditions = {
            "skc": "sunny",
            "few": "sunny",
            "sct": "sunny-overcast",
            "bkn": "sunny-overcast",
            "ovc": "cloudy",
            "wind_skc": "windy",
            "wind_few": "windy",
            "wind_sct": "cloudy-windy",
            "wind_bkn": "cloudy-windy",
            "wind_ovc": "cloudy-windy",
            "snow": "snow",
            "rain_snow": "rain-mix",
            "rain_sleet": "sleet",
            "snow_sleet": "sleet",
            "fzra": "rain-mix",
            "rain_fzra": "rain-mix",
            "snow_fzra": "rain-mix",
            "sleet": "sleet",
            "rain": "rain",
            "rain_showers": "showers",
            "rain_showers_hi": "showers",
            "tsra": "thunderstorm",
            "tsra_sct": "thunderstorm",
            "tsra_hi": "thunderstorm",
            "tornado": "wi-tornado",
            "hurricane": "wi-hurricane-warning",
            "tropical_storm": "wi-hurricane",
            "dust": "wi-dust",
            "smoke": "wi-smoke",
            "haze": "wi-haze",
            "hot": "wi-hot",
            "cold": "wi-cold",
            "blizzard": "snow-wind",
            "fog": "fog",
        };

        var corrections = {
            'wi-night-sunny': 'wi-night-clear',
            'wi-night-sunny-overcast': 'wi-night-partly-cloudy',
        }

        var condition = conditions[classifier];
        if ( condition == null ){
            return prefix;
        }
        else if ( condition.startsWith('wi-') ){
            return condition;
        }
        else{
            var result = prefix + "-" + condition;
            var corrected = corrections[result];
            return corrected != null ? corrected : result;
        }
    },

    // A bunch of these make up the meat
    // In each row we can should display
    //  - time, icon, precip, temp
    renderForecastRow: function (data, addClass) {
        Log.log("Rendering forecast row: " + JSON.stringify(data));

        // Start off with our row
        var row = document.createElement("tr");
        row.className = "forecast-row" + (addClass ? " " + addClass : "");

        // time - hours
        var hourTextSpan = document.createElement("span");
        hourTextSpan.className = "forecast-hour";
        hourTextSpan.innerHTML = this.getHourFromTime(data.startTime);

        // icon
        var iconClass = this.classifyWeather(data);
        Log.log("Got icon class: " + iconClass);
        // var iconHref = data.icon;
        var icon = document.createElement("span");
        icon.className = 'wi weathericon ' + iconClass;

        // var icon = document.createElement('img');
        // icon.src = iconHref;

        // iconSpan.appendChild(icon);

        // precipitation
        // extra check here is due to darksky precip being optional
        var precipPossibility = document.createElement("span");
        precipPossibility.innerHTML = "N/A"

        if (data.probability != null) {
            precipPossibility.innerHTML = data.probability + "%";
        }

        precipPossibility.className = "precipitation"

        // temperature
        var temp = data.temperature;
        temp = Math.round(temp);
        var temperature = document.createElement("span");
        temperature.innerHTML = temp + "&deg;";
        temperature.className = "temp";

        // Add what's necessary and return it
        row.appendChild(hourTextSpan)
        if (this.config.showIconInRow) { row.appendChild(icon); }
        if (this.config.showPrecipitationPossibilityInRow) { row.appendChild(precipPossibility) }
            row.appendChild(temperature)

        Log.log("Adding row: " + row);
        return row;
    },

    renderWeatherForecast: function () {
        Log.log("Rendering forecast...");
        // Placeholders
        var numHours =  this.config.maxHoursForecast;
        var skip = parseInt(this.config.skipHours) + 1;

        // Truncate for the data we need
        // if ( this.weatherData != null && this.weatherData.hourly != null ){
            var now = new Date().getTime();
            var filteredHours = this.weatherData.hourly.filter( function(d, i) { return (now < Date.parse(d.startTime) && (i <= (numHours * skip)) && (i % skip == 0)); });
            Log.log("filtered " + this.weatherData.hourly.length + " hourly data down to: " + filteredHours.length + " using max hours: " + numHours + " and skip: " + skip);
        // }
        // else{

            // var filteredHours = this.weatherData.hourly;
        // }

        // Setup what we'll be displaying
        var display = document.createElement("table");
        display.className = "forecast";

        var days = [];

        // Cycle through and populate our table
        for (let i = 0; i < filteredHours.length; i++) {
            // insert day here if necessary
            var hourData = filteredHours[i];
            var addClass = "";
            if(this.config.fadeForecast) {
                if(i+2 == filteredHours.length) {
                    addClass = "dark";
                }
                if(i+1 == filteredHours.length) {
                    addClass = "darker";
                }
            }
            var row = this.renderForecastRow(hourData, addClass);

            let day = this.getDayFromTime(hourData.time);
            let daySpan = document.createElement("span");

            if (days.indexOf(day) == -1) {
                daySpan.innerHTML = day;
                days.push(day);
            }

            if (this.config.showDayInRow) { row.prepend(daySpan); }

            display.appendChild(row);
        }

        return display;
    },

    // Round the temperature based on tempDecimalPlaces
    roundTemp: function (temp) {
        var scalar = 1 << this.config.tempDecimalPlaces;

        temp *= scalar;
        temp  = Math.round( temp );
        temp /= scalar;

        return temp;
    },

    scheduleUpdate: function(delay) {
        var nextLoad = this.config.updateInterval;
        if (typeof delay !== "undefined" && delay >= 0) {
          nextLoad = delay;
      }

      var self = this;
      setTimeout(function() {
          self.updateWeather();
      }, nextLoad);
    }

});
