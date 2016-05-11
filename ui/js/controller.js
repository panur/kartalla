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
        s.alertCache = {};
        s.vpCache = {};
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

    this.updateAlerts = function (alerts) {
        for (var routeId in state.alertCache) {
            delete state.alertCache[routeId];
        }
        for (var i = 0; i < alerts.length; i++) {
            var routeId = alerts[i]['routeId'];
            if (state.alertCache[routeId] === undefined) {
                state.alertCache[routeId] = {'0': {}, '1': {}, 'general': undefined};
            }
            var direction = alerts[i]['direction'];
            var startTime = alerts[i]['startTime'];
            if ((direction !== undefined) && (startTime !== undefined)) {
                state.alertCache[routeId][direction][startTime] = alerts[i]['text'];
            } else {
                state.alertCache[routeId]['general'] = alerts[i]['text'];
            }
        }
    };

    this.updateVp = function (routeId, direction, startTime, tsi, lat, lng) {
        if (state.vpCache[routeId] === undefined) {
            state.vpCache[routeId] = {'0': {}, '1': {}};
        }
        if (state.vpCache[routeId][direction][startTime] === undefined) {
            state.vpCache[routeId][direction][startTime] = {'tsi': '', 'lat': '', 'lng': ''};
        }
        state.vpCache[routeId][direction][startTime]['tsi'] = tsi;
        state.vpCache[routeId][direction][startTime]['lat'] = lat;
        state.vpCache[routeId][direction][startTime]['lng'] = lng;
    };

    this.cleanVp = function () {
        for (var routeId in state.vpCache) {
            delete state.vpCache[routeId];
        }
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
                    var activeTrip = new ControllerTrip(map, state.alertCache, state.vpCache);
                    activeTrip.init(activeTrips[j], serviceStartDate, state.lang, tripTypeInfo,
                                    state.markerUpdateInterval);
                    state.activeTrips[tripId] = activeTrip;
                    numNewTrips += 1;
                }
            }
        }
        console.log('found %d new active trips for %s', numNewTrips, mapDate.toLocaleString());
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

function ControllerTrip(map, alertCache, vpCache) {
    var that = this;
    var state = getState();

    function getState() {
        var s = {};
        s.gtfsTrip = null;
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
        s.previousSecondsFromStart = null;
        s.previousDistance = null;
        s.vpCacheEntries = {'previous': null, 'valid': null};
        return s;
    }

    this.init = function (gtfsTrip, serviceStartDate, lang, tripTypeInfo, markerUpdateInterval) {
        state.gtfsTrip = gtfsTrip;
        state.serviceStartDate = serviceStartDate;
        state.lang = lang;
        var stopTimes = gtfsTrip.getStopTimes();
        state.lastArrivalSeconds = stopTimes[stopTimes.length - 2] * 60;
        state.startTime = gtfsTrip.getStartTime();
        state.tripType = gtfsTrip.getType();
        state.tripTypeInfo = tripTypeInfo;
        state.markerUpdateInterval = markerUpdateInterval * 1000;
        state.nextMarkerUpdateTime =
            (new Date()).getTime() + (Math.random() * state.markerUpdateInterval);
    };

    function initMarker() {
        var tripPath = map.decodePath(state.gtfsTrip.getShape());
        var stopTimes = state.gtfsTrip.getStopTimes();
        var stopDistances = map.getDistances(tripPath, state.gtfsTrip.getStopDistances());
        state.timesAndDistances = mergeStopTimesAndDistances(stopTimes, stopDistances);
        state.marker = map.addMarker(tripPath, state.gtfsTrip.getShapeId(),
                                     state.tripTypeInfo.isVisible, state.tripTypeInfo.color,
                                     state.gtfsTrip.getName(), getMarkerTitle);
    }

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
            if ((arrivalTime === times[0]) || (arrivalTime === times[1])) {
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
        if (state.marker !== null) {
            map.removeMarker(state.marker);
        }
    }

    this.updateOnMap = function (mapDate, realTime) {
        var tripState = '';
        var fadeSeconds = 60;
        var secondsFromStart = getSecondsFromStart(mapDate);

        if (secondsFromStart < -fadeSeconds) {
            tripState = 'waiting';
        } else {
            var vpCacheEntry = getVpCacheEntry();
            if ((vpCacheEntry === undefined) &&
                (secondsFromStart > (state.lastArrivalSeconds + fadeSeconds))) {
                if (state.marker !== null) {
                    map.removeMarker(state.marker);
                }
                tripState = 'exit';
            } else {
                if (state.tripTypeInfo.isVisible && isTimeToUpdateMarker(realTime)) {
                    if (state.marker === null) {
                        initMarker();
                    }
                    updateActive(vpCacheEntry, fadeSeconds, secondsFromStart);
                }
                tripState = 'active';
            }
        }

        return tripState;
    };

    function getVpCacheEntry() {
        var routeId = state.gtfsTrip.getRouteId();
        var direction = state.gtfsTrip.getDirection();
        var startTime = minutesToString(state.startTime).replace(':', '');
        if ((vpCache[routeId] !== undefined) &&
            (vpCache[routeId][direction][startTime] !== undefined)) {
            var cacheEntry = vpCache[routeId][direction][startTime];
            var cacheEntryAge = getVpEntryAge(cacheEntry['tsi']);
            if (cacheEntryAge < getMaxVpEntryAge()) {
                return cloneVpCacheEntry(cacheEntry);
            } else {
                delete vpCache[routeId][direction][startTime];
            }
        }
        return undefined;
    }

    function getVpEntryAge(tsi) {
        return ((new Date()).getTime() / 1000) - tsi; // age in seconds
    }

    function getMaxVpEntryAge() {
        return 120; // cache entries older than this are considered invalid and they are ignored
    }

    function cloneVpCacheEntry(cacheEntry) {
        return {'tsi': cacheEntry['tsi'], 'lat': cacheEntry['lat'], 'lng': cacheEntry['lng']};
    }

    function updateActive(vpCacheEntry, fadeSeconds, secondsFromStart) {
        var updateMarkerByDistance = true;
        var opacity = 1;

        map.setAlert(state.marker, getAlert() !== undefined);

        if ((vpCacheEntry !== undefined) && (secondsFromStart > 0)) {
            if (areVpCacheEntryPositionsSame(state.vpCacheEntries['previous'], vpCacheEntry)) {
                if (areVpCacheEntryPositionsSame(state.vpCacheEntries['valid'], vpCacheEntry)) {
                    state.vpCacheEntries['valid'] = vpCacheEntry;
                }
            } else {
                var isPositionOk =
                    map.updateVpMarker(state.marker, vpCacheEntry['lat'], vpCacheEntry['lng']);
                if (isPositionOk) {
                    state.vpCacheEntries['valid'] = vpCacheEntry;
                }
            }

            state.vpCacheEntries['previous'] = vpCacheEntry;

            if ((state.vpCacheEntries['valid'] === null) ||
                (getVpEntryAge(state.vpCacheEntries['valid']['tsi']) > getMaxVpEntryAge())) {
                updateMarkerByDistance = true;
            } else {
                updateMarkerByDistance = false;
                opacity = getVpMarkerOpacity(state.vpCacheEntries['valid']['tsi']);
            }
        }

        if (updateMarkerByDistance) {
            var distance = getDistanceFromStart(secondsFromStart, state.timesAndDistances);
            opacity = getDistanceMarkerOpacity(secondsFromStart, fadeSeconds);
            state.previousDistance = distance;
            var isPastLastArrival = secondsFromStart > state.lastArrivalSeconds;
            map.updateDistanceMarker(state.marker, distance, isPastLastArrival);
        }

        state.previousSecondsFromStart = secondsFromStart;

        map.updateMarkerOpacity(state.marker, opacity);
    }

    function getAlert() {
        var routeId = state.gtfsTrip.getRouteId();
        var direction = state.gtfsTrip.getDirection();
        var startTime = state.startTime * 60;

        if (alertCache[routeId] !== undefined) {
            if (alertCache[routeId][direction][startTime] !== undefined) {
                return alertCache[routeId][direction][startTime];
            } else if (alertCache[routeId]['general'] !== undefined) {
                return alertCache[routeId]['general'];
            }
        }
        return undefined;
    }

    function areVpCacheEntryPositionsSame(oldVpCacheEntry, newVpCacheEntry) {
        if (oldVpCacheEntry !== null) {
            if ((oldVpCacheEntry['lat'] === newVpCacheEntry['lat']) &&
                (oldVpCacheEntry['lng'] === newVpCacheEntry['lng'])) {
                return true;
            }
        }
        return false;
    }

    function getSecondsFromStart(mapDate) {
        var secondsAfterMidnight = getSecondsAfterMidnight(mapDate);
        if (mapDate.getDate() !== state.serviceStartDate.getDate()) {
            /* GTFS clock does not wrap around after 24 hours (or 24 * 60 * 60 = 86 400 seconds) */
            secondsAfterMidnight += 24 * 60 * 60;
        }
        return secondsAfterMidnight - (state.startTime * 60);
    }

    function getSecondsAfterMidnight(date) { // possible values: 0 - 86 399.999
        var minutesAfterMidnight = (date.getHours() * 60) + date.getMinutes();
        return ((minutesAfterMidnight * 60) + date.getSeconds()) + (date.getMilliseconds() / 1000);
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

        if (secondsFromStart <= (timesAndDistances[0].departure * 60)) {
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

        return distance;
    }

    function getTimeFromStart(distanceFromStart, timesAndDistances) {
        var seconds = 0;

        for (var i = 1; i < timesAndDistances.length; i++) {
            if (distanceFromStart > timesAndDistances[i].distance) {
                continue;
            } else {
                var secondsInc =
                    (timesAndDistances[i].arrival - timesAndDistances[i - 1].departure) * 60;
                var distanceInc =
                    (timesAndDistances[i].distance - timesAndDistances[i - 1].distance);
                var distanceSincePrevious = distanceFromStart - timesAndDistances[i - 1].distance;
                var fraction = distanceSincePrevious / distanceInc;
                seconds = (timesAndDistances[i - 1].departure * 60) + (fraction * secondsInc);
                break;
            }
        }

        return seconds;
    }

    function getVpMarkerOpacity(tsi) {
        return Math.max(0.2, 1.0 - (getVpEntryAge(tsi) / getMaxVpEntryAge()));
    }

    function getDistanceMarkerOpacity(secondsFromStart, fadeSeconds) {
        if (secondsFromStart < 0) {
            return (fadeSeconds + secondsFromStart) / fadeSeconds;
        } else if (secondsFromStart > state.lastArrivalSeconds) {
            return (fadeSeconds - (secondsFromStart - state.lastArrivalSeconds)) / fadeSeconds;
        } else {
            return 1.0;
        }
    }

    this.updateVisibility = function () {
        if (state.marker !== null) {
            map.setMarkerVisibility(state.marker, state.tripTypeInfo.isVisible);
        }
    };

    function createTripInfo() {
        var startTimeMinutesAfterMidnight = state.startTime;
        var startTime = minutesToString(startTimeMinutesAfterMidnight);
        var duration = state.lastArrivalSeconds / 60;
        var lastArrivalTime = minutesToString(startTimeMinutesAfterMidnight + duration);
        var distanceMeters = state.timesAndDistances[state.timesAndDistances.length - 1].distance;
        var totalDistance = Math.round(distanceMeters / 1000);
        var stopTimes = state.gtfsTrip.getStopTimes();
        var stops = stopTimes.length / 2;
        return {'routeName': state.gtfsTrip.getName(), 'route': state.gtfsTrip.getLongName(),
                'direction': getDirection(), 'startTime': startTime,
                'lastArrivalTime': lastArrivalTime, 'totalDuration': duration, 'duration': null,
                'totalDistance': totalDistance, 'distance': null, 'speed': null,
                'averageSpeed': Math.round((distanceMeters / 1000) / (duration / 60)),
                'stops': stops, 'update': null, 'delayDistance': null, 'delayTime': null,
                'alert': null};
    }

    function minutesToString(minutesAfterMidnight) {
        var date = new Date((minutesAfterMidnight * 60) * 1000);
        var timeString = date.toISOString(); // YYYY-MM-DDTHH:mm:ss.sssZ
        return timeString.substr(11, 5); // HH:mm
    }

    function getDirection() {
        var direction = state.gtfsTrip.getDirection();
        if (direction === undefined) {
            return undefined;
        } else {
            return ['\u2192', '\u2190'][direction]; // 2192=->, 2190=<-
        }
    }

    function updateTripInfo(secondsFromStart, metersFromStart) {
        var minutesFromStart = Math.max(0, (secondsFromStart / 60).toFixed(1));
        var kmsFromStart = (metersFromStart / 1000).toFixed(1);
        if (state.tripInfo === null) {
            state.tripInfo = createTripInfo();
        }
        state.tripInfo.duration = minutesFromStart + ' / ' + state.tripInfo.totalDuration;
        state.tripInfo.distance = kmsFromStart + ' / ' + state.tripInfo.totalDistance;
        state.tripInfo.speed = getSpeed(secondsFromStart, metersFromStart);
        if (state.vpCacheEntries['valid'] !== null) {
            var age = getVpEntryAge(state.vpCacheEntries['valid']['tsi']);
            state.tripInfo.update = Math.round(age);
            var delays = getDelays(secondsFromStart, state.vpCacheEntries['valid']);
            state.tripInfo.delayDistance = delays['distance'];
            state.tripInfo.delayTime = delays['time'];
        }
        state.tripInfo.alert = getAlert();
    }

    function getSpeed(secondsFromStart, metersFromStart) {
        if (secondsFromStart > state.lastArrivalSeconds) {
            return 0;
        } else {
            var timeSeconds = 60;
            var timeHours = ((timeSeconds / 60) / 60);
            var distanceMeters = metersFromStart -
                getDistanceFromStart(secondsFromStart - timeSeconds, state.timesAndDistances);
            /* speed = average speed of the last minute */
            return Math.round((distanceMeters / 1000) / timeHours);
        }
    }

    function getDelays(secondsFromStart, vpCacheEntry) {
        var timetableDistance = getDistanceFromStart(secondsFromStart, state.timesAndDistances);
        var vpDistance =
            map.computeVpDistance(state.marker, vpCacheEntry['lat'], vpCacheEntry['lng']);
        var delayDistanceMeters = timetableDistance - vpDistance;
        var delayTime = 0;
        if (Math.abs(delayDistanceMeters) > 25) {
            var timeFromStart = getTimeFromStart(vpDistance, state.timesAndDistances);
            delayTime = ((secondsFromStart - timeFromStart) / 60).toFixed(1);
        }
        return {'distance': ((delayDistanceMeters) / 1000).toFixed(1), 'time': delayTime};
    }

    function getMarkerTitle(previousUpdateType) {
        var vpTitleItems = ['routeName', 'route', 'direction', 'startTime', 'lastArrivalTime',
                            'update', 'delayDistance', 'delayTime', 'stops', 'alert'];
        var distanceTitleItems = ['routeName', 'route', 'direction', 'startTime', 'lastArrivalTime',
                                  'duration', 'distance', 'speed', 'averageSpeed', 'stops',
                                  'alert'];
        var titleItems = {'vp': vpTitleItems, 'distance': distanceTitleItems}[previousUpdateType];
        var markerTitle = '';

        updateTripInfo(state.previousSecondsFromStart, state.previousDistance);

        for (var i = 0; i < titleItems.length; i++) {
            var itemValue = state.tripInfo[titleItems[i]];
            if (itemValue !== undefined) {
                markerTitle += getMarkerTitleItemName(titleItems[i]) + ': ' + itemValue;
                if (i < (titleItems.length - 1)) {
                    markerTitle += '\n';
                }
            }
        }
        return markerTitle;
    }

    function getMarkerTitleItemName(markerTitleItem) {
        if (state.lang === 'fi') {
            return {'routeName': 'Linja', 'route': 'Reitti', 'direction': 'Suunta',
                    'startTime': 'Lähtöaika', 'lastArrivalTime': 'Tuloaika',
                    'duration': 'Kesto (min)', 'distance': 'Matka (km)',
                    'speed': 'Nopeus (km/h)', 'averageSpeed': 'Keskinopeus (km/h)',
                    'stops': 'Pysäkkejä', 'update': 'Päivitys (s)',
                    'delayDistance': 'Viive (km)', 'delayTime': 'Viive (min)',
                    'alert': 'Häiriö'}[markerTitleItem];
        } else {
            return {'routeName': 'Route name', 'route': 'Route', 'direction': 'Direction',
                    'startTime': 'Departure time', 'lastArrivalTime': 'Arrival time',
                    'duration': 'Duration (min)', 'distance': 'Distance (km)',
                    'speed': 'Speed (km/h)', 'averageSpeed': 'Average speed (km/h)',
                    'stops': 'Stops', 'update': 'Update (s)',
                    'delayDistance': 'Delay (km)', 'delayTime': 'Delay (min)',
                    'alert': 'Alert'}[markerTitleItem];
        }
    }
}
