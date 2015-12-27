/* Author: Panu Ranta, panu.ranta@iki.fi, http://14142.net/kartalla/about.html */

'use strict';

function Config() {
    var supportedParams = ['lat', 'lng', 'zoom', 'date', 'time', 'speed', 'interval', 'types',
        'routes', '_file', '_stop'];
    var urlParams = getUrlParams();
    this.stopAfter = urlParams._stop || null;
    this.mapLat = urlParams.lat || 60.273969;
    this.mapLng = urlParams.lng || 24.791911;
    this.mapZoomLevel = Number(urlParams.zoom) || 10;
    this.startDate = getStartDate();
    this.speed = urlParams.speed || 1;
    this.interval = urlParams.interval || 5;
    this.lang = getLang();
    this.visibleTypes = getVisibleTypes();
    this.onlyRoutes = getOnlyRoutes();
    this.json_url = getJsonUrl();

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
            return checkValueInterval(parameterValue, 8, 16);
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
                   (parameterName === '_file')) {
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

    function getJsonUrl() {
        if (urlParams._file !== undefined) {
            return 'json/' + urlParams._file + '.json';
        } else {
            return 'json/gtfs.json';
        }
    }
}
