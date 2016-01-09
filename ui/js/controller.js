/* Author: Panu Ranta, panu.ranta@iki.fi, http://14142.net/kartalla/about.html */

'use strict';

function Controller(gtfs, map) {
    var that = this;
    var state = getState();

    function getState() {
        var s = {};
        s.lang = null;
        s.onlyRoutes = null;
        s.tripTypeInfos = null;
        s.markerUpdateInterval = null;
        s.nextTripUpdate = 0;
        s.activeServicesDateString = null;
        s.activeServices = {};
        s.activeTrips = {};
        return s;
    }

    this.init = function (lang, onlyRoutes, tripTypeInfos, markerUpdateInterval) {
        state.lang = lang;
        state.onlyRoutes = onlyRoutes;
        state.tripTypeInfos = tripTypeInfos;
        state.markerUpdateInterval = markerUpdateInterval;
    };

    this.restart = function () {
        for (var tripId in state.activeTrips) {
            state.activeTrips[tripId].remove();
        }
        state.nextTripUpdate = 0;
        state.activeServicesDateString = null;
        state.activeServices = {};
        state.activeTrips = {};
    };

    this.update = function (mapDate) {
        var mapDateString = getDateString(mapDate);

        if (((Object.keys(state.activeServices)).length === 0) && (mapDate.getHours() < 6)) {
            /* if we start soon after midnight (let's assume 6 hours to be safe) we need to start
            with yesterday's services */
            var yesterdayDate = new Date(mapDate.getTime() - (24 * 60 * 60 * 1000));
            updateActiveServices(getDateString(yesterdayDate), yesterdayDate);
        }

        if (state.activeServicesDateString !== mapDateString) {
            updateActiveServices(mapDateString, mapDate);
            state.activeServicesDateString = mapDateString;
        }

        if (mapDate.getTime() > state.nextTripUpdate) {
            deleteOldServices(mapDate);
            var updatePeriodInMinutes = 10;
            state.nextTripUpdate = mapDate.getTime() + (updatePeriodInMinutes * 60 * 1000);
            updateActiveTrips(mapDate, updatePeriodInMinutes);
        }

        updateTripsOnMap(mapDate);
    };

    function updateTripsOnMap(mapDate) {
        state.tripTypeInfos.resetStatistics();
        var tripsToBeDeleted = [];
        var realTime = (new Date()).getTime();
        for (var tripId in state.activeTrips) {
            var tripState = state.activeTrips[tripId].updateOnMap(mapDate, realTime);
            if (tripState === 'exit') {
                tripsToBeDeleted.push(tripId);
            } else if (tripState === 'active') {
                state.tripTypeInfos.getType(state.activeTrips[tripId].getType()).count += 1;
            }
        }
        for (var i = 0; i < tripsToBeDeleted.length; i++) {
            delete state.activeTrips[tripsToBeDeleted[i]];
        }
        if (tripsToBeDeleted.length > 0) {
            console.log('deleted %d trips', tripsToBeDeleted.length);
        }
        state.tripTypeInfos.refreshStatistics();
    }

    this.updateTripTypeVisibility = function (tripTypeName) {
        for (var tripId in state.activeTrips) {
            if (state.activeTrips[tripId].getType() === tripTypeName) {
                state.activeTrips[tripId].updateVisibility();
            }
        }
    };

    function getDateString(date) {
        function pad(number) {
            if (number < 10) {
                return '0' + number;
            } else {
                return number;
            }
        }
        return '' + date.getFullYear() + pad(date.getMonth() + 1) + pad(date.getDate());
    }

    function updateActiveServices(dateString, date) { // dateString = YYYYMMDD
        var numNewServices = 0;
        var routes = gtfs.getRoutes();
        for (var i = 0; i < routes.length; i++) {
            if ((state.onlyRoutes === null) ||
                (state.onlyRoutes.indexOf(routes[i].getName()) !== -1)) {
                var activeServices = routes[i].getActiveServices(dateString);
                for (var j = 0; j < activeServices.length; j++) {
                    var serviceId = activeServices[j].getId();
                    var activeService = new ControllerService();
                    activeService.init(activeServices[j], date);
                    state.activeServices[serviceId] = activeService;
                    numNewServices += 1;
                }
            }
        }

        console.log('found %d new active services for %s', numNewServices, dateString);
    }

    function deleteOldServices(mapDate) {
        var servicesToBeDeleted = [];
        for (var serviceId in state.activeServices) {
            if (state.activeServices[serviceId].isTimeToDelete(mapDate)) {
                servicesToBeDeleted.push(serviceId);
            }
        }
        for (var i = 0; i < servicesToBeDeleted.length; i++) {
            delete state.activeServices[servicesToBeDeleted[i]];
        }
        if (servicesToBeDeleted.length > 0) {
            console.log('deleted %d services', servicesToBeDeleted.length);
        }
    }

    function updateActiveTrips(mapDate, updatePeriodInMinutes) {
        var numNewTrips = 0;
        for (var serviceId in state.activeServices) {
            var activeTrips =
                state.activeServices[serviceId].getActiveTrips(mapDate, updatePeriodInMinutes);
            for (var j = 0; j < activeTrips.length; j++) {
                var tripId = activeTrips[j].getId();
                if (state.activeTrips[tripId] === undefined) {
                    var tripTypeInfo = state.tripTypeInfos.getType(activeTrips[j].getType());
                    var serviceStartDate = state.activeServices[serviceId].getStartDate();
                    var activeTrip = new ControllerTrip(map);
                    activeTrip.init(activeTrips[j], serviceStartDate, state.lang, tripTypeInfo,
                                    state.markerUpdateInterval);
                    state.activeTrips[tripId] = activeTrip;
                    numNewTrips += 1;
                }
            }
        }
        console.log('found %d new active trips for %o', numNewTrips, mapDate.toLocaleString());
    }
}

function ControllerService() {
    var that = this;
    var state = getState();

    function getState() {
        var s = {};
        s.gtfsService = null;
        s.startDate = null;
        return s;
    }

    this.init = function (gtfsService, startDate) {
        state.gtfsService = gtfsService;
        state.startDate = startDate;
    };

    this.isTimeToDelete = function (mapDate) {
        if (mapDate.getDate() !== state.startDate.getDate()) {
            if (mapDate.getHours() >= 6) {
                return true;
            }
        }
        return false;
    };

    this.getActiveTrips = function (mapDate, updatePeriodInMinutes) {
        var fromMinutesAfterMidnight = getMinutesAfterMidnight(mapDate);
        if (mapDate.getDate() !== state.startDate.getDate()) {
            /* GTFS clock does not wrap around after 24 hours (or 24 * 60 = 1440 minutes) */
            fromMinutesAfterMidnight += 24 * 60;
        }
        return state.gtfsService.getActiveTrips(fromMinutesAfterMidnight,
            fromMinutesAfterMidnight + updatePeriodInMinutes);
    };

    function getMinutesAfterMidnight(date) {
        return (date.getHours() * 60) + date.getMinutes(); // possible values: 0 - 1439
    }

    this.getStartDate = function () {
        return state.startDate;
    };
}

function ControllerTrip(map) {
    var that = this;
    var state = getState();

    function getState() {
        var s = {};
        s.serviceStartDate = null;
        s.lang = null;
        s.timesAndDistances = null;
        s.lastArrivalSeconds = null;
        s.marker = null;
        s.startTime = null;
        s.tripType = null;
        s.tripInfo = null;
        s.tripTypeInfo = null;
        s.markerUpdateInterval = null;
        s.nextMarkerUpdateTime = null;
        return s;
    }

    this.init = function (gtfsTrip, serviceStartDate, lang, tripTypeInfo, markerUpdateInterval) {
        state.serviceStartDate = serviceStartDate;
        state.lang = lang;
        var tripPath = map.decodePath(gtfsTrip.getShape());
        var stopTimes = gtfsTrip.getStopTimes();
        var stopDistances = map.getDistances(tripPath, gtfsTrip.getStopDistances());
        state.timesAndDistances = mergeStopTimesAndDistances(stopTimes, stopDistances);
        state.lastArrivalSeconds =
            state.timesAndDistances[state.timesAndDistances.length - 1].arrival * 60;
        state.marker = map.addMarker(tripPath, gtfsTrip.getShapeId(), tripTypeInfo.isVisible,
                                     tripTypeInfo.color);
        state.startTime = gtfsTrip.getStartTime();
        state.tripType = gtfsTrip.getType();
        state.tripInfo =
            createTripInfo(gtfsTrip.getName(), gtfsTrip.getDirection(), gtfsTrip.getLongName(),
                           state.startTime, state.lastArrivalSeconds,
                           stopDistances[stopDistances.length - 1], stopTimes.length / 2);
        state.tripTypeInfo = tripTypeInfo;
        state.markerUpdateInterval = markerUpdateInterval * 1000;
        state.nextMarkerUpdateTime =
            (new Date()).getTime() + (Math.random() * state.markerUpdateInterval);
    };

    /* Merge stop times (arrival/departure) and distances into list of objects with unique arrival
    time (to simplify the calculation of distance from start when given seconds from start). The
    first and last stops are not modified but otherwise returned distances don't necessary match
    with any real stop. For times=[[0,0,0,0,2,2,3,3,3,3,4,4,6,6,6,6,6,6] and
    distances=[100,10,210,300,380,430,11,12,600] stops {0,0,10}, {6,6,11} and {6,6,12} are skipped
    and stops {3,3,300} and {3,3,380} are combined into {3,3,365} and what is finally returned is
    [{0,0,100},{2,2,210},{3,3,365},{4,4,430},{6,6,600}] */
    function mergeStopTimesAndDistances(times, distances) {
        var timesAndDistances = [];

        for (var i = 0; i < distances.length; i++) {
            var arrivalTime = times[i * 2];
            var departureTime = times[(i * 2) + 1];
            var distance = distances[i];
            if (arrivalTime === times[0]) {
                if (i !== 0) {
                    distance = undefined; // skip if same as 1st but not 1st
                }
            } else if (arrivalTime === times[times.length - 2]) {
                if (i !== (distances.length - 1)) {
                    distance = undefined; // skip if same as last but not last
                }
            } else {
                var sameArrivals = getSameArrivals(times, i * 2);
                if (sameArrivals > 0) { // many stops with same arrival time
                    distance = Math.round((distances[i] + distances[i + sameArrivals + 1]) / 2);
                    i += sameArrivals; // save the first with average distance, skip the rest
                }
            }

            if (distance !== undefined) {
                timesAndDistances.push({arrival: arrivalTime, departure: departureTime,
                                        distance: distance});
            }
        }
        return timesAndDistances;
    }

    function getSameArrivals(times, startIndex) {
        var sameArrivals = 0;
        for (var i = startIndex + 2; i < times.length; i += 2) {
            if (times[i] === times[startIndex]) {
                sameArrivals += 1;
            }
        }
        return sameArrivals;
    }

    this.getType = function () {
        return state.tripType;
    };

    this.remove = function () {
        map.removeMarker(state.marker);
    }

    this.updateOnMap = function (mapDate, realTime) {
        var tripState = '';
        var fadeSeconds = 60;
        var secondsFromStart = getSecondsFromStart(mapDate);

        if (secondsFromStart > (state.lastArrivalSeconds + fadeSeconds)) {
            map.removeMarker(state.marker);
            tripState = 'exit';
        } else if ((secondsFromStart >= -fadeSeconds) &&
            (secondsFromStart <= (state.lastArrivalSeconds + fadeSeconds))) {
            if (isTimeToUpdateMarker(realTime)) {
                var distance = getDistanceFromStart(secondsFromStart, state.timesAndDistances);
                var opacity = getMarkerOpacity(secondsFromStart, fadeSeconds);
                updateTripInfo(secondsFromStart, distance);
                map.updateMarker(state.marker, distance, opacity, getMarkerTitle());
            }
            tripState = 'active';
        } else {
            tripState = 'waiting';
        }

        return tripState;
    };

    function getSecondsFromStart(mapDate) {
        var secondsAfterMidnight = getSecondsAfterMidnight(mapDate);
        if (mapDate.getDate() !== state.serviceStartDate.getDate()) {
            /* GTFS clock does not wrap around after 24 hours (or 24 * 60 * 60 = 86 400 seconds) */
            secondsAfterMidnight += 24 * 60 * 60;
        }
        return secondsAfterMidnight - (state.startTime * 60);
    }

    function getSecondsAfterMidnight(date) {
        var minutesAfterMidnight = (date.getHours() * 60) + date.getMinutes();
        return (minutesAfterMidnight * 60) + date.getSeconds(); // possible values: 0 - 86 399
    }

    function isTimeToUpdateMarker(realTime) {
        if (realTime > state.nextMarkerUpdateTime) {
            state.nextMarkerUpdateTime += state.markerUpdateInterval;
            return true;
        } else {
            return false;
        }
    }

    function getDistanceFromStart(secondsFromStart, timesAndDistances) {
        var distance = 0;

        if (secondsFromStart <= 0) {
            distance = timesAndDistances[0].distance;
        } else if (secondsFromStart >= state.lastArrivalSeconds) {
            distance = timesAndDistances[timesAndDistances.length - 1].distance;
        } else {
            for (var i = 1; i < timesAndDistances.length; i++) {
                if (secondsFromStart > (timesAndDistances[i].departure * 60)) {
                    continue;
                } else if ((secondsFromStart >= (timesAndDistances[i].arrival * 60)) &&
                           (secondsFromStart <= (timesAndDistances[i].departure * 60))) {
                    distance = timesAndDistances[i].distance;
                    break;
                } else {
                    var secondsInc =
                        (timesAndDistances[i].arrival - timesAndDistances[i - 1].departure) * 60;
                    var distanceInc =
                        (timesAndDistances[i].distance - timesAndDistances[i - 1].distance);
                    var secondsSincePrevious =
                        secondsFromStart - (timesAndDistances[i - 1].departure * 60);
                    var fraction = secondsSincePrevious / secondsInc;
                    distance = timesAndDistances[i - 1].distance + (fraction * distanceInc);
                    break;
                }
            }
        }

        return Math.round(distance);
    }

    function getMarkerOpacity(secondsFromStart, fadeSeconds) {
        if (secondsFromStart < 0) {
            return (fadeSeconds + secondsFromStart) / fadeSeconds;
        } else if (secondsFromStart > state.lastArrivalSeconds) {
            return (fadeSeconds - (secondsFromStart - state.lastArrivalSeconds)) / fadeSeconds;
        } else {
            return 1.0;
        }
    }

    this.updateVisibility = function () {
        map.setMarkerVisibility(state.marker, state.tripTypeInfo.isVisible);
    };

    function createTripInfo(tripName, direction, tripLongName, startTimeMinutesAfterMidnight,
                            durationSeconds, distanceMeters, stops) {
        var startTime = minutesToString(startTimeMinutesAfterMidnight);
        var duration = durationSeconds / 60;
        var lastArrivalTime = minutesToString(startTimeMinutesAfterMidnight + duration);
        var totalDistance = Math.round(distanceMeters / 1000);
        return {'routeName': tripName, 'route': tripLongName, 'direction': direction,
                'startTime': startTime, 'lastArrivalTime': lastArrivalTime,
                'totalDuration': duration, 'duration': null, 'totalDistance': totalDistance,
                'distance': null, 'averageSpeed': Math.round(totalDistance / (duration / 60)),
                'stops': stops};
    }

    function minutesToString(minutesAfterMidnight) {
        var date = new Date((minutesAfterMidnight * 60) * 1000);
        var timeString = date.toISOString(); // YYYY-MM-DDTHH:mm:ss.sssZ
        return timeString.substr(11, 5); // HH:mm
    }

    function updateTripInfo(secondsFromStart, metersFromStart) {
        var minutesFromStart = Math.max(0, (secondsFromStart / 60).toFixed(1));
        var kmsFromStart = (metersFromStart / 1000).toFixed(1);
        state.tripInfo.duration = minutesFromStart + ' / ' + state.tripInfo.totalDuration;
        state.tripInfo.distance = kmsFromStart + ' / ' + state.tripInfo.totalDistance;
    }

    function getMarkerTitle() {
        var titleItems = ['routeName', 'route', 'direction', 'startTime', 'lastArrivalTime',
                          'duration', 'distance', 'averageSpeed', 'stops'];
        var markerTitle = '';
        for (var i = 0; i < titleItems.length; i++) {
            markerTitle += getMarkerTitleItemName(titleItems[i]) + ': ' +
                                                  state.tripInfo[titleItems[i]];
            if (i < (titleItems.length - 1)) {
                markerTitle += '\n';
            }
        }
        return markerTitle;
    }

    function getMarkerTitleItemName(markerTitleItem) {
        if (state.lang === 'fi') {
            return {'routeName': 'Linja', 'route': 'Reitti', 'direction': 'Suunta',
                    'startTime': 'Lähtöaika', 'lastArrivalTime': 'Tuloaika',
                    'duration': 'Kesto (min)', 'distance': 'Matka (km)',
                    'averageSpeed': 'Keskinopeus (km/h)', 'stops': 'Pysäkkejä'}[markerTitleItem];
        } else {
            return {'routeName': 'Route name', 'route': 'Route', 'direction': 'Direction',
                    'startTime': 'Departure time', 'lastArrivalTime': 'Arrival time',
                    'duration': 'Duration (min)', 'distance': 'Distance (km)',
                    'averageSpeed': 'Average speed (km/h)', 'stops': 'Stops'}[markerTitleItem];
        }
    }
}
