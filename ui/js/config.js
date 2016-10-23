/* Author: Panu Ranta, panu.ranta@iki.fi, http://14142.net/kartalla/about.html */

'use strict';

function Config(utils) {
    var that = this;
    var supportedParams = ['data', 'lat', 'lng', 'zoom', 'date', 'time', 'speed', 'interval',
        'types', 'routes', 'alerts', 'vp', '_file', '_stop'];
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
    this.isAlertsUsed = getIsAlertsUsed(urlParams.alerts);
    this.isVpUsed = getIsVpUsed(urlParams.vp);

    this.restart = function (newDataType) {
        that.dataType = newDataType;
        that.mapLat = getMapLat();
        that.mapLng = getMapLng();
        that.mapZoomLevel = getMapZoomLevel();
        that.vehicleTypes = getVehicleTypes();
        that.visibleTypes = getVisibleTypes();
        that.jsonUrl = getJsonUrl(undefined);
        that.isAlertsUsed = getIsAlertsUsed(urlParams.alerts);
        that.isVpUsed = getIsVpUsed(urlParams.vp);
    };

    this.getShareLinkParamsList = function (mapParams, date, tripTypes, isVpUsed) {
        var paramsList = [];
        paramsList.push({'name': 'data', 'on': true, 'value': that.dataType});
        paramsList.push({'name': 'lat', 'on': true, 'value': formatLatLng(mapParams['lat'])});
        paramsList.push({'name': 'lng', 'on': true, 'value': formatLatLng(mapParams['lng'])});
        paramsList.push({'name': 'zoom', 'on': true, 'value': mapParams['zoom']});
        paramsList.push({'name': 'date', 'on': false, 'value': getShareLinkDate(date)});
        paramsList.push({'name': 'time', 'on': false, 'value': getShareLinkTime(date)});
        paramsList.push({'name': 'speed', 'on': false, 'value': that.speed});
        paramsList.push({'name': 'interval', 'on': false, 'value': that.interval});
        if (that.isAlertsUsed !== undefined) {
            paramsList.push({'name': 'alerts', 'on': false, 'value': ~~that.isAlertsUsed});
        }
        if (isVpUsed !== undefined) {
            paramsList.push({'name': 'vp', 'on': false, 'value': ~~isVpUsed});
        }
        if (that.vehicleTypes.length > 1) {
            var types = getShareLinkTypes(tripTypes);
            if (types !== '') {
                paramsList.push({'name': 'types', 'on': true, 'value': types});
            }
        }
        if (urlParams.routes !== undefined) {
            paramsList.push({'name': 'routes', 'on': true, 'value': urlParams.routes});
        }
        return paramsList;
    };

    function formatLatLng(latOrLng) {
        return latOrLng.toString().substr(0, 9);
    }

    function getShareLinkDate(date) {
        return utils.dateToString(date).replace(/-/g, '');
    }

    function getShareLinkTime(date) {
        return utils.dateToString(date, true).split(' ')[1].replace(/:/g, '');
    }

    function getShareLinkTypes(tripTypes) {
        var types = [];
        for (var tripTypeName in tripTypes) {
            if (tripTypes[tripTypeName].isVisible) {
                types.push(tripTypeName);
            }
        }
        return types.join('_');
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
        } else if ((parameterName === 'alerts') || (parameterName === 'vp')) {
            return checkValueInterval(parameterValue, 0, 1);
        }
    }

    function checkValueInterval(paramValue, minValue, maxValue) {
        var re = /\d+/;
        return re.test(paramValue) && (paramValue >= minValue) && (paramValue <= maxValue);
    }

    function getMapLat() {
        return {
            'hsl': 60.302709, 'suomi': 65.229573,
            'hameenlinna': 60.993705, 'joensuu': 62.607072, 'jyvaskyla': 62.235599,
            'kotka': 60.487563, 'kouvola': 60.866238, 'kuopio': 62.900360, 'lahti': 60.983510,
            'lappeenranta': 61.058213, 'mikkeli': 61.683347, 'oulu': 65.021237,
            'tampere': 61.475903, 'turku': 60.444043, 'vaasa': 63.097463
        }[that.dataType];
    }

    function getMapLng() {
        return {
            'hsl': 24.940832, 'suomi': 26.918078,
            'hameenlinna': 24.458368, 'joensuu': 29.791886, 'jyvaskyla': 25.761523,
            'kotka': 26.906511, 'kouvola': 26.705006, 'kuopio': 27.662373, 'lahti': 25.650401,
            'lappeenranta': 28.188472, 'mikkeli': 27.283888, 'oulu': 25.468197,
            'tampere': 23.774071, 'turku': 22.276154, 'vaasa': 21.621426
        }[that.dataType];
    }

    function getMapZoomLevel() {
        return {
            'hsl': 10, 'suomi': 5,
            'hameenlinna': 12, 'joensuu': 12, 'jyvaskyla': 11,
            'kotka': 12, 'kouvola': 11, 'kuopio': 12, 'lahti': 11,
            'lappeenranta': 12, 'mikkeli': 12, 'oulu': 11,
            'tampere': 11, 'turku': 11, 'vaasa': 13
        }[that.dataType];
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
        } else if (that.dataType === 'suomi') {
            return ['bus', 'train', 'tram', 'metro', 'ferry', 'airplane'];
        } else {
            return ['bus'];
        }
    }

    function getVisibleTypes() {
        if (urlParams.types !== undefined) {
            return urlParams.types.split('_');
        } else {
            if (that.dataType === 'hsl') {
                return ['train', 'ferry'];
            } else if (that.dataType === 'suomi') {
                return ['train'];
            } else {
                return ['bus'];
            }
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
            if ((that.dataType === 'hsl') || (that.dataType === 'suomi')) {
                return 'json/' + that.dataType + '.json';
            } else {
                return 'json/split/' + that.dataType + '.json';
            }
        }
    }

    function getIsAlertsUsed(urlParamsAlers) {
        if (that.dataType === 'hsl') {
            return urlParamsAlers !== '0';
        } else {
            return undefined;
        }
    }

    function getIsVpUsed(urlParamsVp) {
        if (that.dataType === 'hsl') {
            return urlParamsVp === '1';
        } else {
            return undefined;
        }
    }
}
