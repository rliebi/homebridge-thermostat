/*
 {
 "bridge": {
 ...
 },

 "description": "...",

 "accessories": [
 {
 "accessory": "Thermostat",
 "name": "Thermostat Demo",
 "apiroute": "http://myurl.com"
 }
 ],

 "platforms":[]
 }

 */


var Service, Characteristic;
var request = require("request");

module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerAccessory("homebridge-thermostat", "Thermostat", Thermostat);
};


function Thermostat(log, config) {
    this.log = log;
    this.maxTemp = config.maxTemp || 38;
    this.minTemp = config.minTemp || 12;
    this.name = config.name;
    this.apiroute = config.apiroute || "apiroute";
    this.sendimmediately = config["sendimmediately"] || "";
    this.username = config["username"] || "";
    this.password = config["password"] || "";
    this.log(this.name, this.apiroute);
    //Characteristic.TemperatureDisplayUnits.CELSIUS = 0;
    //Characteristic.TemperatureDisplayUnits.FAHRENHEIT = 1;
    this.temperatureDisplayUnits = Characteristic.TemperatureDisplayUnits.CELSIUS;
    this.temperature = 19;
    this.relativeHumidity = 0.70;
    this.switchHandling = config["switchHandling"] || "no";
    // The value property of CurrentHeatingCoolingState must be one of the following:
    //Characteristic.CurrentHeatingCoolingState.OFF = 0;
    //Characteristic.CurrentHeatingCoolingState.HEAT = 1;
    //Characteristic.CurrentHeatingCoolingState.COOL = 2;
    this.heatingCoolingState = Characteristic.CurrentHeatingCoolingState.OFF;
    this.targetTemperature = 21;
    this.targetRelativeHumidity = 0.5;
    this.heatingThresholdTemperature = 25;
    this.coolingThresholdTemperature = 5;
    // The value property of TargetHeatingCoolingState must be one of the following:
    //Characteristic.TargetHeatingCoolingState.OFF = 0;
    //Characteristic.TargetHeatingCoolingState.HEAT = 1;
    //Characteristic.TargetHeatingCoolingState.COOL = 2;
    //Characteristic.TargetHeatingCoolingState.AUTO = 3;
    this.targetHeatingCoolingState = Characteristic.TargetHeatingCoolingState.AUTO;

    this.service = new Service.Thermostat(this.name);
    var that = this;
    if (this.apiroute != "apiroute" && this.switchHandling == "realtime") {
        var powerurl = this.apiroute + "/status";
        var statusemitter = pollingtoevent(function (done) {
            that.httpRequest(powerurl, "", "GET", that.username, that.password, that.sendimmediately, function (error, response, body) {
                if (error) {
                    that.log('HTTP get power function failed: %s', error.message);
                    callback(error);
                } else {
                    done(null, body);
                }
            })
        }, {longpolling: true, interval: 1000, longpollEventName: "statuspoll"});

        statusemitter.on("statuspoll", function (data) {
            var json = JSON.parse(data);
            that.state = binaryState > 0;
            that.log(that.service, "received power", that.apiroute, "state is currently", json);
            // switch used to easily add additonal services
            that.targetState = json.targetStateCode;
            that.service.setCharacteristic(Characteristic.TargetHeatingCoolingState, that.targetStateCode);
        });
    }
}

Thermostat.prototype = {
    httpRequest: function (url, body, method, username, password, sendimmediately, callback) {
        request({
                url: url,
                body: body,
                method: method,
                auth: {
                    user: username,
                    pass: password,
                    sendImmediately: sendimmediately
                }
            },
            function (error, response, body) {
                callback(error, response, body);
            });
    },
    //Start
    identify: function (callback) {
        this.log("Identify requested!");
        callback(null);
    },
    // Required
    getCurrentHeatingCoolingState: function (callback) {
        this.log("getCurrentHeatingCoolingState from:", this.apiroute + "/status");
        request.get({
            url: this.apiroute + "/status"
        }, function (err, response, body) {
            if (!err && response.statusCode == 200) {
                this.log("response success");
                var json = JSON.parse(body); //{"targetState":"AUTO","targetStateCode":6,"currentHeatingCoolingState":0,"targetTemperature":10,"temperature":12,"humidity":98}
                this.log("currentHeatingCoolingState is %s", json.currentHeatingCoolingState);
                this.currentHeatingCoolingState = json.currentHeatingCoolingState;
                this.service.setCharacteristic(Characteristic.CurrentHeatingCoolingState, this.currentHeatingCoolingState);

                callback(null, this.currentHeatingCoolingState); // success
            } else {
                this.log("Error getting CurrentHeatingCoolingState: %s", err);
                callback(err);
            }
        }.bind(this));
    },
    getTargetHeatingCoolingState: function (callback) {
        this.log("getTargetHeatingCoolingState from:", this.apiroute + "/status");
        request.get({
            url: this.apiroute + "/status"
        }, function (err, response, body) {
            if (!err && response.statusCode == 200) {
                this.log("response success");
                var json = JSON.parse(body); //{"targetState":"AUTO","targetStateCode":6,"currentHeatingCoolingState":0,"targetTemperature":10,"temperature":12,"humidity":98}
                this.log("targetState is %s", json.targetStateCode);
                this.targetState = json.targetStateCode;
                this.service.setCharacteristic(Characteristic.TargetHeatingCoolingState, this.targetStateCode);

                callback(null, this.targetStateCode); // success
            } else {
                this.log("Error getting TargetHeatingCoolingState: %s", err);
                callback(err);
            }
        }.bind(this));
    },
    setTargetHeatingCoolingState: function (value, callback) {
        if (value === undefined) {
            callback(); //Some stuff call this without value doing shit with the rest
        } else {
            this.log("setTargetHeatingCoolingState from/to:", this.targetHeatingCoolingState, value);

            var action;

            switch (value) {
                case Characteristic.TargetHeatingCoolingState.OFF:
                    action = "/off";
                    break;

                case Characteristic.TargetHeatingCoolingState.HEAT:
                    action = "/comfort";
                    break;

                case Characteristic.TargetHeatingCoolingState.AUTO:
                    action = "/auto";
                    break;

                case Characteristic.TargetHeatingCoolingState.COOL:
                    action = "/no-frost";
                    break;

                default:
                    action = "/no-frost";
                    this.log("Not handled case:", value);
                    break;
            }

            request.get({
                url: this.apiroute + action
            }, function (err, response, body) {
                if (!err && response.statusCode == 200) {
                    this.log("response success");
                    //this.service.setCharacteristic(Characteristic.TargetHeatingCoolingState, value);
                    this.targetHeatingCoolingState = value;
                    callback(null); // success
                } else {
                    this.log("Error getting state: %s", err);
                    callback(err);
                }
            }.bind(this));
        }
    },
    getCurrentTemperature: function (callback) {
        this.log("getCurrentTemperature from:", this.apiroute + "/status");
        request.get({
            url: this.apiroute + "/status"
        }, function (err, response, body) {
            if (!err && response.statusCode == 200) {
                this.log("response success");
                var json = JSON.parse(body); //{"state":"OFF","targetStateCode":5,"temperature":"18.10","humidity":"34.10"}
                this.log("CurrentTemperature %s", json.temperature);
                this.temperature = parseFloat(json.temperature);
                callback(null, this.temperature); // success
            } else {
                this.log("Error getting state: %s", err);
                callback(err);
            }
        }.bind(this));
    },
    getTargetTemperature: function (callback) {
        this.log("getTargetTemperature from:", this.apiroute + "/status");
        request.get({
            url: this.apiroute + "/status"
        }, function (err, response, body) {
            if (!err && response.statusCode == 200) {
                this.log("response success");
                var json = JSON.parse(body); //{"state":"OFF","targetStateCode":5,"temperature":"18.10","humidity":"34.10"}
                this.targetTemperature = parseFloat(json.targetTemperature);
                this.log("Target temperature is %s", this.targetTemperature);
                callback(null, this.targetTemperature); // success
            } else {
                this.log("Error getting state: %s", err);
                callback(err);
            }
        }.bind(this));
    },
    setTargetTemperature: function (value, callback) {
        this.log("setTargetTemperature from:", this.apiroute + "/targetTemperature/" + value);
        request.get({
            url: this.apiroute + "/targetTemperature/" + value
        }, function (err, response, body) {
            if (!err && response.statusCode == 200) {
                this.log("response success");
                callback(null); // success
            } else {
                this.log("Error getting state: %s", err);
                callback(err);
            }
        }.bind(this));
    },
    getTemperatureDisplayUnits: function (callback) {
        this.log("getTemperatureDisplayUnits:", this.temperatureDisplayUnits);
        var error = null;
        callback(error, this.temperatureDisplayUnits);
    },
    setTemperatureDisplayUnits: function (value, callback) {
        this.log("setTemperatureDisplayUnits from %s to %s", this.temperatureDisplayUnits, value);
        this.temperatureDisplayUnits = value;
        var error = null;
        callback(error);
    },

    // Optional
    getCurrentRelativeHumidity: function (callback) {
        this.log("getCurrentRelativeHumidity from:", this.apiroute + "/status");
        request.get({
            url: this.apiroute + "/status"
        }, function (err, response, body) {
            if (!err && response.statusCode == 200) {
                this.log("response success");
                var json = JSON.parse(body); //{"state":"OFF","targetStateCode":5,"temperature":"18.10","humidity":"34.10"}
                this.log("Humidity state is %s (%s)", json.targetState, json.humidity);
                this.relativeHumidity = parseFloat(json.humidity);
                callback(null, this.relativeHumidity); // success
            } else {
                this.log("Error getting state: %s", err);
                callback(err);
            }
        }.bind(this));
    },
    getTargetRelativeHumidity: function (callback) {
        this.log("getTargetRelativeHumidity:", this.targetRelativeHumidity);
        var error = null;
        callback(error, this.targetRelativeHumidity);
    },
    setTargetRelativeHumidity: function (value, callback) {
        this.log("setTargetRelativeHumidity from/to :", this.targetRelativeHumidity, value);
        this.targetRelativeHumidity = value;
        var error = null;
        callback(error);
    },
    /*	getCoolingThresholdTemperature: function(callback) {
     this.log("getCoolingThresholdTemperature: ", this.coolingThresholdTemperature);
     var error = null;
     callback(error, this.coolingThresholdTemperature);
     },
     */    getHeatingThresholdTemperature: function (callback) {
        this.log("getHeatingThresholdTemperature :", this.heatingThresholdTemperature);
        var error = null;
        callback(error, this.heatingThresholdTemperature);
    },
    getName: function (callback) {
        this.log("getName :", this.name);
        var error = null;
        callback(error, this.name);
    },

    getServices: function () {

        // you can OPTIONALLY create an information service if you wish to override
        // the default values for things like serial number, model, etc.
        var informationService = new Service.AccessoryInformation();

        informationService
            .setCharacteristic(Characteristic.Manufacturer, "HTTP Manufacturer")
            .setCharacteristic(Characteristic.Model, "HTTP Model")
            .setCharacteristic(Characteristic.SerialNumber, "HTTP Serial Number");


        // Required Characteristics
        this.service
            .getCharacteristic(Characteristic.CurrentHeatingCoolingState)
            .on('get', this.getCurrentHeatingCoolingState.bind(this));

        this.service
            .getCharacteristic(Characteristic.TargetHeatingCoolingState)
            .on('get', this.getTargetHeatingCoolingState.bind(this))
            .on('set', this.setTargetHeatingCoolingState.bind(this));

        this.service
            .getCharacteristic(Characteristic.CurrentTemperature)
            .on('get', this.getCurrentTemperature.bind(this));

        this.service
            .getCharacteristic(Characteristic.TargetTemperature)
            .on('get', this.getTargetTemperature.bind(this))
            .on('set', this.setTargetTemperature.bind(this));

        this.service
            .getCharacteristic(Characteristic.TemperatureDisplayUnits)
            .on('get', this.getTemperatureDisplayUnits.bind(this))
            .on('set', this.setTemperatureDisplayUnits.bind(this));

        // Optional Characteristics
        this.service
            .getCharacteristic(Characteristic.CurrentRelativeHumidity)
            .on('get', this.getCurrentRelativeHumidity.bind(this));

        this.service
            .getCharacteristic(Characteristic.TargetRelativeHumidity)
            .on('get', this.getTargetRelativeHumidity.bind(this))
            .on('set', this.setTargetRelativeHumidity.bind(this));
        /*
         this.service
         .getCharacteristic(Characteristic.CoolingThresholdTemperature)
         .on('get', this.getCoolingThresholdTemperature.bind(this));
         */

        this.service
            .getCharacteristic(Characteristic.HeatingThresholdTemperature)
            .on('get', this.getHeatingThresholdTemperature.bind(this));

        this.service
            .getCharacteristic(Characteristic.Name)
            .on('get', this.getName.bind(this));
        this.service.getCharacteristic(Characteristic.CurrentTemperature)
            .setProps({
                minValue: this.minTemp,
                maxValue: this.maxTemp,
                minStep: 1
            });
        this.service.getCharacteristic(Characteristic.TargetTemperature)
            .setProps({
                minValue: this.minTemp,
                maxValue: this.maxTemp,
                minStep: 1
            });
        this.log(this.minTemp);
        return [informationService, this.service];
    }
};
