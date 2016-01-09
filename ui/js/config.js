/* Author: Panu Ranta, panu.ranta@iki.fi, http://14142.net/kartalla/about.html */

'use strict';

function Config() {
    var that = this;
    var supportedParams = ['data', 'lat', 'lng', 'zoom', 'date', 'time', 'speed', 'interval',
        'types', 'routes', '_file', '_stop'];
    var urlParams = getUrlParams();
    this.dataType = urlParams.data || 'hsl';
    this.stopAfter = urlParams._stop || null;
    this.mapLat = urlParams.lat || getMapLat();
    this.mapLng = urlParams.lng || getMapLng();
    this.mapZoomLevel = Number(urlParams.zoom) || getMapZoomLevel();
    this.startDate = getStartDate();
    this.speed = urlParams.speed || 1;
    this.interval = urlParams.interval || 5;
    this.lang = getLang();
    this.vehicleTypes = getVehicleTypes();
    this.visibleTypes = getVisibleTypes();
    this.onlyRoutes = getOnlyRoutes();
    this.jsonUrl = getJsonUrl(urlParams._file);

    this.restart = function (newDataType) {
        this.dataType = newDataType.toLowerCase();
        this.mapLat = getMapLat();
        this.mapLng = getMapLng();
        this.mapZoomLevel = getMapZoomLevel();
        this.vehicleTypes = getVehicleTypes();
        this.jsonUrl = getJsonUrl(undefined);
    }

    function getUrlParams() {
        var params = {};
        if (document.URL.indexOf('?') !== -1) {
            var addressParams = document.URL.split('?');
            if (addressParams.length === 2) {
                var nameValues = addressParams[1].split('&');
                for (var i = 0; i < nameValues.length; i++) {
                    var nameValue = nameValues[i].split('=');
                    if (nameValue.length === 2) {
                        if (supportedParams.indexOf(nameValue[0]) !== -1) {
                            params[nameValue[0]] = nameValue[1];
                        } else {
                            console.error('unexpected URL parameter name: %o', nameValue[0]);
                        }
                    } else {
                        console.error('unexpected URL parameter: %o', nameValues[i]);
                    }
                }
            } else {
                console.error('unexpected URL parameters: %o', document.URL);
            }
        }

        validateUrlParameters(params);
        return params;
    }

    function validateUrlParameters(urlParameters) {
        for (var i = 0; i < supportedParams.length; i++) {
            if (urlParameters[supportedParams[i]] !== undefined) {
                if (isValidUrlParameter(supportedParams[i],
                    urlParameters[supportedParams[i]]) === false) {
                    console.error('unexpected URL parameter name=value: %o=%o', supportedParams[i],
                                  urlParameters[supportedParams[i]]);
                    delete urlParameters[supportedParams[i]];
                }
            }
        }
    }

    function isValidUrlParameter(parameterName, parameterValue) {
        if ((parameterName === 'lat') || (parameterName === 'lng')) {
            var re = /\d+\.\d+/;
            return re.test(parameterValue);
        } else if (parameterName === 'zoom') {
            return checkValueInterval(parameterValue, 5, 16);
        } else if (parameterName === 'date') {
            var re = /\d{8}/; // YYYYMMDD
            return re.test(parameterValue);
        } else if (parameterName === 'time') {
            var re = /\d{6}/; // HHMMSS
            return re.test(parameterValue);
        } else if (parameterName === 'speed') {
            return checkValueInterval(parameterValue, 1, 100);
        } else if (parameterName === 'interval') {
            return checkValueInterval(parameterValue, 1, 10);
        } else if ((parameterName === 'types') || (parameterName === 'routes') ||
                   (parameterName === 'data') || (parameterName === '_file')) {
            var re = /\w+/;
            return re.test(parameterValue);
        } else if (parameterName === '_stop') {
            var re = /\d+/;
            return re.test(parameterValue);
        }
    }

    function checkValueInterval(paramValue, minValue, maxValue) {
        var re = /\d+/;
        return re.test(paramValue) && (paramValue >= minValue) && (paramValue <= maxValue);
    }

    function getMapLat() {
        return {'hsl': 60.273969, 'suomi': 65.229573}[that.dataType];
    }

    function getMapLng() {
        return {'hsl': 24.791911, 'suomi': 26.918078}[that.dataType];
    }

    function getMapZoomLevel() {
        return {'hsl': 10, 'suomi': 5}[that.dataType];
    }

    function getStartDate() {
        var startDate = new Date();

        if (urlParams.date !== undefined) {
            startDate.setFullYear(urlParams.date.substr(0, 4));
            startDate.setMonth(urlParams.date.substr(4, 2) - 1);
            startDate.setDate(urlParams.date.substr(6, 2));
        }

        if (urlParams.time !== undefined) {
            startDate.setHours(urlParams.time.substr(0, 2));
            startDate.setMinutes(urlParams.time.substr(2, 2));
            startDate.setSeconds(urlParams.time.substr(4, 2));
        }

        return startDate;
    }

    function getLang() {
        if (document.documentElement.getAttribute('lang') === 'fi') {
            return 'fi';
        } else {
            return 'en';
        }
    }

    function getVehicleTypes() {
        if (that.dataType === 'hsl') {
            return ['bus', 'train', 'tram', 'metro', 'ferry'];
        } else {
            return ['bus', 'train', 'airplane'];
        }
    }

    function getVisibleTypes() {
        if (urlParams.types !== undefined) {
            return urlParams.types.split('_');
        } else {
            return ['train', 'ferry'];
        }
    }

    function getOnlyRoutes() {
        if (urlParams.routes !== undefined) {
            return urlParams.routes.split('_');
        } else {
            return null;
        }
    }

    function getJsonUrl(urlParamsFile) {
        if (urlParamsFile !== undefined) {
            return 'json/' + urlParamsFile + '.json';
        } else {
            return 'json/' + that.dataType + '.json';
        }
    }
}
