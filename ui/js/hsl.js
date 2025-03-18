/* Author: Panu Ranta, panu.ranta@iki.fi, https://14142.net/kartalla/about.html */

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
                    if (request.responseText.length > 0) {
                        var jsonAlerts = JSON.parse(request.responseText).data.alerts;
                        var parsedAlerts = parseAlerts(jsonAlerts, controller.getRouteTypes());
                        uiBar.updateAlerts(parsedAlerts['uiBar']);
                        controller.updateAlerts(parsedAlerts['controller']);
                        request.onreadystatechange = function () {};
                    }
                } else {
                    console.error('unexpected status: ' + status);
                }
            }
        };
        request.open('POST', 'https://api.digitransit.fi/routing/v2/hsl/gtfs/v1',
                     true);
        request.setRequestHeader('Content-Type', 'application/graphql');
        request.setRequestHeader('digitransit-subscription-key',
                                 'e2d17429164e4d14a885dedf2560627f');
        request.send(getQuery());
    }

    function getQuery() {
        var routeQuery = ' route { gtfsId type shortName longName } ';
        var tripQuery = ' trip { gtfsId directionId stoptimes { scheduledArrival } } ';
        var textQuery = ' alertDescriptionTextTranslations { language text } ';
        return '{ alerts { ' + routeQuery + tripQuery + textQuery + ' } }';
    }

    function parseAlerts(jsonAlerts, routeTypes) {
        var uiBarAlerts = [];
        var alertTexts = {};
        var controllerAlerts = [];
        for (var i = 0; i < jsonAlerts.length; i++) {
            var translations = jsonAlerts[i]['alertDescriptionTextTranslations'];
            for (var j = 0; j < translations.length; j++) {
                var translation = translations[j];
                if ((translation['language'] === state.lang) &&
                    (jsonAlerts[i].hasOwnProperty('route'))) {
                    if (!alertTexts.hasOwnProperty(translation['text'])) {
                        alertTexts[translation['text']] = '-';
                    }
                    var route = jsonAlerts[i]['route'];
                    if ((route !== null) && (routeTypes[route['type']])) {
                        alertTexts[translation['text']] = routeTypes[route['type']];
                    }
                    if (route !== null) {
                        controllerAlerts.push(getControllerAlert(route, jsonAlerts[i]['trip'],
                                                                 translation['text']));
                    }
                }
            }
        }
        for (var alertText in alertTexts) {
            uiBarAlerts.push({'text': alertText, 'type': alertTexts[alertText]});
        }
        return {'uiBar': uiBarAlerts, 'controller': controllerAlerts};
    }

    function getControllerAlert(route, trip, alertText) {
        var routeId = route['gtfsId'].split(':')[1];
        var direction = undefined;
        var startTime = undefined;
        if ((trip !== undefined) && (trip !== null)) {
            direction = trip['directionId'];
            startTime = trip['stoptimes'][0]['scheduledArrival'];
        }
        return {'routeId': routeId, 'direction': direction, 'startTime': startTime,
                'text': alertText};
    }
}

function HslMqtt(utils, controller, uiBar) {
    var that = this;
    var state = getState();

    function getState() {
        var s = {};
        s.isVpUsed = null;
        s.client = null;
        s.dataCount = 0;
        s.topicFilters = [];
        s.subscriptions = 0;
        s.messageRate = {'intervalSec': 10, 'numMessages': 0, 'startTime': null};
        s.verbose = false;
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
        var clientId = 'kartalla_' + Math.random().toString(16).substr(2, 8);
        var key = 'digitransit-subscription-key=e2d17429164e4d14a885dedf2560627f';
        state.client = new Paho.MQTT.Client('wss://mqtt.hsl.fi:443/?' + key, clientId);
        state.client.onConnectionLost = onConnectionLost;
        state.client.onMessageArrived = onMessageArrived;
        state.client.connect({'onSuccess': onConnect, 'onFailure': onFailedConnect});

        function onConnectionLost(responseObject) {
            processFailure('lost mqtt connection', responseObject);
        }

        function onConnect() {
            console.log('connected mqtt');
            state.subscriptions = 0;
            state.messageRate.numMessages = 0;
            state.messageRate.startTime = null;
            subscribeTopics();
        }

        function onFailedConnect(responseObject) {
            processFailure('failed to connect mqtt', responseObject);
        }

        function processFailure(failureText, responseObject) {
            console.log('%s: errorCode=%o, errorMessage=%o',
                        failureText, responseObject.errorCode, responseObject.errorMessage);
            controller.cleanVp();
            state.isVpUsed = false;
            uiBar.updatePositionType();
        }

        function onMessageArrived(message) {
            var topic = message.destinationName;
            var payload = message.payloadString;
            var parsedVp = JSON.parse(payload).VP;
            if (isVpMessageOk(parsedVp)) {
                updateCache(topic, parsedVp);
            } else {
                console.log('invalid payload for topic ("%o"): %o', topic, payload);
            }
            state.dataCount += topic.length + payload.length;
            updateMessageRate();
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
        var routeId = topic.split('/')[9];
        var startTime = parsedVp['start'].replace(':', '');
        controller.updateVp(routeId, parsedVp['dir'] - 1, startTime, parsedVp['tsi'],
                            parsedVp['lat'], parsedVp['long']);
    }

    function updateMessageRate() {
        state.messageRate.numMessages += 1;
        if (state.messageRate.startTime === null) {
            state.messageRate.startTime = Date.now();
        } else {
            var messageRateDurationSec = (Date.now() - state.messageRate.startTime) / 1000;
            if (messageRateDurationSec > state.messageRate.intervalSec) {
                if (state.verbose) {
                    console.log('%o mqtt messages per second (%o subscriptions)',
                                (state.messageRate.numMessages / messageRateDurationSec).toFixed(2),
                                state.subscriptions);
                }
                state.messageRate.startTime = Date.now();
                state.messageRate.numMessages = 0;
            }
        }
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

    this.mapBoundsChanged = function (zoom, minLat, minLng, maxLat, maxLng) {
        if (zoom > 16) {
            var multiplier = 1000;
            var geohashLevel = 5;
        } else if (zoom > 13) {
            var multiplier = 100;
            var geohashLevel = 4;
        } else if (zoom > 10) {
            var multiplier = 10;
            var geohashLevel = 3;
        } else if (zoom > 7) {
            var multiplier = 1;
            var geohashLevel = 0;
        } else {
            var multiplier = 0;
            var geohashLevel = 0;
        }

        if (multiplier > 0) {
            var geohashLat = createGeohashLatLng(minLat, maxLat, multiplier);
            var geohashLng = createGeohashLatLng(minLng, maxLng, multiplier);
            updateTopicFilters(geohashLat, geohashLng, geohashLevel);
        }
    };

    function updateTopicFilters(geohashLat, geohashLng, geohashLevel) {
        var geohashes = createGeohashes(geohashLat, geohashLng);
        var newTopicFilters = createTopicFilters(geohashLevel, geohashes);
        if (newTopicFilters.join() !== state.topicFilters.join()) {
            unsubscribeTopics();
            state.topicFilters = newTopicFilters;
            if (state.verbose) {
                console.log('new topic filters (geohashLevel=%o, lat=%o, lng=%o): %o',
                            geohashLevel, geohashLat, geohashLng, newTopicFilters);
            }
            subscribeTopics();
        }
    }

    function createGeohashLatLng(minValue, maxValue, multiplier) {
        var minV = Math.floor(minValue * multiplier);
        var maxV = Math.floor(maxValue * multiplier);
        return {'min': minV, 'n': maxV - minV};
    }

    function createGeohashes(geohashLat, geohashLng) {
        var geohashes = [];
        for (var i = 0; i <= geohashLat['n']; i++) {
            for (var j = 0; j <= geohashLng['n']; j++) {
                geohashes.push(createGeohash(geohashLat['min'] + i, geohashLng['min'] + j));
            }
        }
        return geohashes;
    }

    function createGeohash(lat, lng) {  // 60123, 24789 becomes 60;24/17/28/39
        var geohash = '';
        while (true) {
            if (lat < 100) {
                geohash = lat + ';' + lng + geohash;
                return geohash;
            } else {
                geohash = '/' + (lat % 10) + (lng % 10) + geohash;
                lat = Math.floor(lat / 10);
                lng = Math.floor(lng / 10);
            }
        }
    }

    function createTopicFilters(geohashLevel, geohashes) {
        var filters = [];
        for (var i = 0; i < geohashes.length; i++) {
            filters.push(createTopicFilter(geohashLevel, geohashes[i]));
        }
        return filters;
    }

    function createTopicFilter(geohashLevel, geohash) {
        var filter = [
            // prefix
            '/hfp',
            // version
            'v2',
            // journey_type: journey, deadrun or signoff
            'journey',
            // temporal_type: ongoing or upcoming
            'ongoing',
            // event_type: vp, due, arr, dep, ars, pde, pas, wait, doo, doc, tlr, tla, da, dout, ba,
            // bout, vja or vjout
            'vp',
            // transport_mode: bus, tram, train, ferry or metro
            '+',
            // operator_id: 4 digits
            '+',
            // vehicle_number: 5 digits
            '+',
            // route_id: as in GTFS
            '+',
            // direction_id: 1 or 2
            '+',
            // headsign
            '+',
            // start_time: HH:mm
            '+',
            // next_stop: stop_id in GTFS
            '+',
            // geohash_level
            geohashLevel,
            // geohash
            geohash,
            // + for the rest of the levels
            '#'
        ];
        return filter.join('/');
    }

    function subscribeTopics() {
        for (var i = 0; i < state.topicFilters.length; i++) {
            if (state.client !== null) {
                state.client.subscribe(state.topicFilters[i], {'onSuccess': onSubscribeSuccess,
                                                               'onFailure': onSubscribeFailure});
            }
        }

        function onSubscribeSuccess() {
            state.subscriptions += 1;
        }

        function onSubscribeFailure(responseObject) {
            console.log('failed to subscribe (%o): %o',
                        responseObject.errorCode, responseObject.errorMessage);
        }
    }

    function unsubscribeTopics() {
        for (var i = 0; i < state.topicFilters.length; i++) {
            if (state.client !== null) {
                state.client.unsubscribe(state.topicFilters[i],
                                         {'onSuccess': onUnsubscribeSuccess,
                                          'onFailure': onUnsubscribeFailure});
            }
        }

        function onUnsubscribeSuccess() {
            state.subscriptions -= 1;
        }

        function onUnsubscribeFailure(responseObject) {
            console.log('failed to unsubscribe (%o): %o',
                        responseObject.errorCode, responseObject.errorMessage);
        }
    }
}
