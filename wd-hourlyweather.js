/*
 * Display the hourly forecast from the weatherdata module's notification
 * Author: John Casey (https://github.com/jdcasey)
 *
 * Adapted from: MMM-darksky-hourly (https://github.com/jacquesCedric/MMM-darksky-hourly)
 */

Module.register("wd-hourlyweather", {

    defaults: {
        units: config.units,
        language: config.language,
        timeFormat: config.timeFormat,
        showPrecipitationPossibilityInRow: true,
        showDayInRow: true,
        showIconInRow: true,
        fadeForecast: true,
        updateInterval: 10 * 60 * 1000, // every 5 minutes
        animationSpeed: 1000,
        initialLoadDelay: 3000, // 0 seconds delay
        retryDelay: 2500,
        maxHoursForecast: 8,   // maximum number of hours to show in forecast
        skipHours: 1,
        tempDecimalPlaces: 0,
        debug: false
    },

    getTranslations: function () {
      return false;
    },

    getScripts: function () {
      return [
        'moment.js'
      ];
    },

    getStyles: function () {
      return ["weather-icons.css", "wd-hourlyweather.css"];
    },

    start: function () {
      Log.info("Starting module: " + this.name);

      // Set locale.
      moment.locale(config.language);

      this.weatherData = null;
    },

    processWeather: function () {
      if ( this.weatherData === null ){
        Log.log("Required data is incomplete. Waiting for hourly or current data");
        return;
      }

      // Log.log("Processing weather data...");

      this.loaded = true;
      this.updateDom(this.config.animationSpeed);
    },

    notificationReceived: function(notification, payload, sender) {
      switch(notification) {
          case "DOM_OBJECTS_CREATED":
              break;
          case "WEATHER_REFRESHED":
              this.weatherData = payload;
              this.processWeather();
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

    // A bunch of these make up the meat
    // In each row we can should display
    //  - time, icon, precip, temp
    renderForecastRow: function (data, addClass) {
        // Log.log("Rendering forecast row: " + JSON.stringify(data));

        // Start off with our row
        var row = document.createElement("tr");
        row.className = "forecast-row" + (addClass ? " " + addClass : "");

        // time - hours
        var hourTextSpan = document.createElement("span");
        hourTextSpan.className = "forecast-hour";
        hourTextSpan.innerHTML = moment(data.dt*1000).format("ha");

        // icon
        var iconClass = data.weather[0].weatherClass;
        // Log.log("Got icon class: " + iconClass);
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

        if (data.pop !== undefined) {
            precipPossibility.innerHTML = Math.round(data.pop*100) + "%";
        }

        precipPossibility.className = "precipitation"

        // temperature
        var temp = data.temp;
        temp = Math.round(temp);
        var temperature = document.createElement("span");
        temperature.innerHTML = temp + "&deg;";
        temperature.className = "temp";

        // Add what's necessary and return it
        row.appendChild(hourTextSpan)
        if (this.config.showIconInRow) { row.appendChild(icon); }
        if (this.config.showPrecipitationPossibilityInRow) { row.appendChild(precipPossibility) }
            row.appendChild(temperature)

        // Log.log("Adding row: " + row);
        return row;
    },

    renderWeatherForecast: function () {
        var numHours =  this.config.maxHoursForecast;
        var skip = parseInt(this.config.skipHours) + 1;

        var now = new Date().getTime();
        var filteredHours = this.weatherData.hourly.filter((d, i) => {
            return (now < d.dt * 1000 && i <= (numHours * skip) && i % skip == 0);
        });

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

            let day = moment(hourData.dt*1000).format("ddd");

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

});
