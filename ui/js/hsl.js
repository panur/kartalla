/* Author: Panu Ranta, panu.ranta@iki.fi, http://14142.net/kartalla/about.html */

'use strict';

function HslAlerts(controller, uiBar) {
    var that = this;
    var state = getState();

    function getState() {
        var s = {};
        s.isUsed = false;
        s.lang = null;
        s.nextUpdate = 0;
        return s;
    }

    this.init = function (isUsed, lang) {
        state.isUsed = isUsed;
        state.lang = lang;
    };

    this.restart = function (isUsed) {
        state.isUsed = isUsed;
        state.nextUpdate = 0;
    };

    this.isUsed = function () {
        return state.isUsed;
    };

    this.update = function (mapDate) {
        if (state.isUsed === true) {
            if (mapDate.getTime() > state.nextUpdate) {
                var updatePeriodInMinutes = 1;
                state.nextUpdate = mapDate.getTime() + (updatePeriodInMinutes * (60 * 1000));
                downloadAlerts();
            }
        }
    };

    function downloadAlerts() {
        var request = new XMLHttpRequest();
        request.onreadystatechange = function () {
            if (request.readyState === 4) {
                var status = request.status;
                if ((status === 0) || (status === 200)) {
                    var jsonAlerts = JSON.parse(request.responseText).data.alerts;
                    var parsedAlerts = parseAlerts(jsonAlerts);
                    uiBar.updateAlerts(parsedAlerts['uiBar']);
                    controller.updateAlerts(parsedAlerts['controller']);
                    request.onreadystatechange = function () {};
                } else {
                    console.error('unexpected status: ' + status);
                }
            }
        };
        request.open('POST', 'http://digitransit.fi/otp/routers/finland/index/graphql', true);
        request.setRequestHeader('Content-Type', 'application/graphql');
        request.send(getQuery());
    }

    function getQuery() {
        var routeQuery = ' route { gtfsId type shortName longName } ';
        var tripQuery = ' trip { gtfsId directionId stoptimes { scheduledArrival } } ';
        var textQuery = ' alertDescriptionTextTranslations { language text } ';
        return '{ alerts { ' + routeQuery + tripQuery + textQuery + ' } }';
    }

    function parseAlerts(jsonAlerts) {
        var uiBarAlerts = [];
        var alertTexts = [];
        var controllerAlerts = [];
        for (var i = 0; i < jsonAlerts.length; i++) {
            var translations = jsonAlerts[i]['alertDescriptionTextTranslations'];
            for (var j = 0; j < translations.length; j++) {
                var translation = translations[j];
                if (translation['language'] === state.lang) {
                    var route = jsonAlerts[i]['route'];
                    if (alertTexts.indexOf(translation['text']) === -1) {
                        alertTexts.push(translation['text']);
                        var routeType = '-';
                        if (route !== null) {
                            routeType = route['type'];
                        }
                        uiBarAlerts.push({'text': translation['text'], 'type': routeType});
                    }
                    if (route !== null) {
                        controllerAlerts.push(getControllerAlert(route, jsonAlerts[i]['trip'],
                                                                 translation['text']));
                    }
                }
            }
        }

        return {'uiBar': uiBarAlerts, 'controller': controllerAlerts};
    }

    function getControllerAlert(route, trip, alertText) {
        var routeId = route['gtfsId'].split(':')[1];
        var direction = undefined;
        var startTime = undefined;
        if (trip !== null) {
            direction = trip['directionId'];
            startTime = trip['stoptimes'][0]['scheduledArrival'];
        }
        return {'routeId': routeId, 'direction': direction, 'startTime': startTime,
                'text': alertText};
    }
}

function HslMqtt(utils, controller) {
    var that = this;
    var state = getState();

    function getState() {
        var s = {};
        s.isVpUsed = null;
        s.client = null;
        s.dataCount = 0;
        return s;
    }

    this.init = function (isVpUsed) {
        state.isVpUsed = isVpUsed;
    };

    this.restart = function (isVpUsed) {
        if (state.isVpUsed) {
            disconnect();
        }
        state.isVpUsed = isVpUsed;
    };

    this.isVpUsed = function () {
        return state.isVpUsed;
    };

    this.toggleUsage = function () {
        state.isVpUsed = !state.isVpUsed;
        if (state.isVpUsed) {
            that.connect();
        } else {
            disconnect();
        }
    };

    this.connect = function () {
        var readyEvent = document.createEvent('Event');
        readyEvent.initEvent('vpCacheDownloadIsReady', false, false);
        document.addEventListener('vpCacheDownloadIsReady', downloadIsReady, false);
        var downloadRequest = null;
        utils.downloadUrl('http://dev.hsl.fi/hfp/journey/', null, function (request) {
            downloadRequest = request;
            document.dispatchEvent(readyEvent);
        });
        function downloadIsReady() {
            var messages = JSON.parse(downloadRequest.responseText);
            for (var topic in messages) {
                var parsedVp = messages[topic].VP;
                if (isVpMessageOk(parsedVp)) {
                    updateCache(topic, parsedVp);
                }
            }
            connectMqtt();
        }
    };

    function connectMqtt() {
        var clientId = 'kartalla_' + Math.random().toString(16).substr(2, 8);
        state.client = new Paho.MQTT.Client('213.138.147.225', 1883, clientId);
        state.client.onMessageArrived = onMessageArrived;
        state.client.connect({onSuccess:onConnect});

        function onConnect() {
            state.client.subscribe('/hfp/journey/#');
            console.log('connected mqtt');
        }

        function onMessageArrived(message) {
            var topic = message.destinationName;
            var payload = message.payloadString;
            var parsedVp = JSON.parse(payload).VP;
            if (isVpMessageOk(parsedVp)) {
                updateCache(topic, parsedVp);
            }
            state.dataCount += topic.length + payload.length;
        }
    }

    function isVpMessageOk(parsedVp) {
        var fields = ['dir', 'start', 'tsi', 'lat', 'long'];
        for (var i = 0; i < fields.length; i++) {
            if (parsedVp[fields[i]] === undefined) {
                return false;
            }
        }
        if (['1', '2'].indexOf(parsedVp['dir']) === -1) {
            return false;
        }
        return true;
    }

    function updateCache(topic, parsedVp) {
        var routeId = topic.split('/')[5];
        controller.updateVp(routeId, parsedVp['dir'] - 1, parsedVp['start'], parsedVp['tsi'],
                            parsedVp['lat'], parsedVp['long']);
    }

    function disconnect() {
        if (state.client !== null) {
            state.client.disconnect();
            state.client = null;
            console.log('disconnected mqtt');
        }
        controller.cleanVp();
    };

    this.getDataCount = function () {
        if (state.isVpUsed === undefined) {
            return undefined;
        } else {
            return state.dataCount;
        }
    };
}
