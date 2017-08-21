/* Author: Panu Ranta, panu.ranta@iki.fi, https://14142.net/kartalla/about.html */

'use strict';

function Gtfs() {
    var that = this;
    var state = getState();

    function getState() {
        var s = {};
        s.root = null;
        s.arrayKeys = null;
        return s;
    }

    this.init = function (jsonData) {
        state.root = jsonData;
        state.arrayKeys = state.root[0];
    };

    this.getArrayKeys = function (node) {
        return state.arrayKeys[node];
    };

    function getArrayKey(keyId) {
        return that.getArrayKeys('root')[keyId];
    }

    this.getDtfsEpoch = function () {
        return state.root[getArrayKey('gtfs_epoch')];
    };

    this.getJsonEpoch = function () {
        return state.root[getArrayKey('json_epoch')];
    };

    this.getRouteTypes = function () {
        return state.root[getArrayKey('route_types')];
    };

    this.getDates = function () {
        return state.root[getArrayKey('dates')];
    };

    this.getRoutes = function () {
        var routes = [];
        for (var i = 0; i < state.root[getArrayKey('routes')].length; i++) {
            var route = new GtfsRoute(i, that, getRootRoute(i));
            routes.push(route);
        }
        return routes;
    };

    function getRootRoute(routeIndex) {
        return state.root[getArrayKey('routes')][routeIndex];
    }

    // For '#$%1~!$2!~!!$3' return [0, 1, 2, 14, 91, 92, 15, 182, 183, 16].
    this.stringToIntegerList = function (string) {
        var integerList = [];
        var integerValue = 0;
        var multChr = 33; // 33='!'
        var minChr = 35;  // 35='#', not 34='"' because it takes three characters in JSON
        var maxChr = 126; // 126='~'
        var maxValue = maxChr - minChr;
        for (var i = 0; i < string.length; i++) {
            var charCode = string.charCodeAt(i);
            if (charCode === multChr) {
                integerValue += maxValue;
            } else {
                integerValue += charCode - minChr;
                integerList.push(integerValue);
                integerValue = 0;
            }
        }
        return integerList;
    };

    // For [10, 1, 11, 3] return [0, 10, 11, 22, 25]
    this.unpackDeltaList = function (integerList) {
        var unpackedList = [0];
        for (var i = 0; i < integerList.length; i++) {
            unpackedList.push(unpackedList[i] + integerList[i]);
        }
        return unpackedList;
    };
}

function GtfsRoute(routeId, gtfsRoot, rootRoute) {
    var that = this;

    this.getId = function () {
        return routeId;
    };

    function getArrayKey(keyId) {
        return gtfsRoot.getArrayKeys('route')[keyId];
    }

    this.getRouteId = function () {
        return rootRoute[getArrayKey('id')];
    };

    this.getName = function () {
        return rootRoute[getArrayKey('name')];
    };

    this.getLongName = function () {
        return rootRoute[getArrayKey('long_name')];
    };

    this.getType = function () {
        return rootRoute[getArrayKey('type')];
    };

    this.getShape = function (shapeIndex) {
        return rootRoute[getArrayKey('shapes')][shapeIndex];
    };

    this.getStopDistances = function (stopDistancesIndex) {
        var stopDistancesString = rootRoute[getArrayKey('stop_distances')][stopDistancesIndex];
        return gtfsRoot.unpackDeltaList(gtfsRoot.stringToIntegerList(stopDistancesString));
    };

    this.getTripDates = function (tripDatesIndex) {
        return rootRoute[getArrayKey('trip_dates')][tripDatesIndex];
    };

    function getTripGroup(tripGroupIndex) {
        return rootRoute[getArrayKey('trip_groups')][tripGroupIndex];
    }

    function getStopTimes(stopTimesIndex) {
        return rootRoute[getArrayKey('stop_times')][stopTimesIndex];
    }

    function getIsDepartureTimes() {
        return rootRoute[getArrayKey('is_departure_times')];
    }

    function getDirections() {
        return rootRoute[getArrayKey('directions')];
    };

    this.isDirections = function () {
        return getDirections().length > 1;
    };

    this.getActiveTrips = function (dateString, fromMinutesAfterMidnight,
                                    toMinutesAfterMidnight) { // dateString = YYYYMMDD
        var activeTrips = [];
        var directions = getDirections();
        for (var i = 0; i < directions.length; i++) {
            var trips = directions[i][gtfsRoot.getArrayKeys('direction')['trips']];
            if (trips.length > 0) { // some routes have only direction 1
                activeTrips = activeTrips.concat(getActiveDirectionTrips(i, trips, dateString,
                                                 fromMinutesAfterMidnight, toMinutesAfterMidnight));
            }
        }
        return activeTrips;
    };

    function getTripArrayKey(keyId) {
        return gtfsRoot.getArrayKeys('trip')[keyId];
    }

    function getActiveDirectionTrips(directionIndex, directionTrips, dateString,
                                     fromMinutesAfterMidnight, toMinutesAfterMidnight) {
        var firstStartTime = directionTrips[getTripArrayKey('first_start_time')];
        var startTimesString = directionTrips[getTripArrayKey('start_times')];
        var startTimes =
            gtfsRoot.unpackDeltaList(gtfsRoot.stringToIntegerList(startTimesString));
        var stopTimesIndexesString = directionTrips[getTripArrayKey('stop_times_indexes')];
        var stopTimesIndexes = gtfsRoot.stringToIntegerList(stopTimesIndexesString);
        var tripGroupIndexesString = directionTrips[getTripArrayKey('trip_group_indexes')];
        var tripGroupIndexes = gtfsRoot.stringToIntegerList(tripGroupIndexesString);

        var activeTrips = [];
        for (var i = 0; i < startTimes.length; i++) {
            var startTime = firstStartTime + startTimes[i];
            var stopTimes = getTripStopTimes(stopTimesIndexes[i]);
            if ((startTime <= toMinutesAfterMidnight) &&
                ((startTime + stopTimes[stopTimes.length - 1]) > fromMinutesAfterMidnight)) {
                var tripGroup = getTripGroup(tripGroupIndexes[i]);
                var trip = new GtfsTrip(i, gtfsRoot, that, directionIndex, startTime, stopTimes,
                                        tripGroup);
                if (trip.isActive(dateString)) {
                    activeTrips.push(trip);
                }
            }
        }
        return activeTrips;
    }

    function getTripStopTimes(stopTimesI) {
        var isDepartureTimes = getIsDepartureTimes();
        var stopTimeDeltas = gtfsRoot.stringToIntegerList(getStopTimes(stopTimesI));
        var stopTimes = gtfsRoot.unpackDeltaList(stopTimeDeltas);
        if (isDepartureTimes === 0) {
            stopTimes = addDepartureTimes(stopTimes);
        }
        return stopTimes;
    }

    function addDepartureTimes(arrivalTimes) {
        var stopTimes = [];
        for (var i = 0; i < arrivalTimes.length; i++) {
            // arrival time is used as missing departure time
            stopTimes.push(arrivalTimes[i], arrivalTimes[i]);
        }
        return stopTimes;
    }
}

function GtfsTrip(tripId, gtfsRoot, gtfsRoute, directionIndex, startTime, stopTimes, tripGroup) {
    var that = this;

    this.getId = function () {
        return gtfsRoute.getId() + '_' + directionIndex + '_' + tripId;
    };

    this.getRouteId = function () {
        return gtfsRoute.getRouteId();
    };

    this.getName = function () {
        return gtfsRoute.getName();
    };

    this.getLongName = function () {
        return gtfsRoute.getLongName();
    };

    this.getDirection = function () {
        if (gtfsRoute.isDirections()) {
            return directionIndex;
        } else {
            return undefined;
        }
    };

    this.getType = function () {
        return gtfsRoute.getType();
    };

    this.getStartTime = function () {
        return startTime;
    };

    this.getStopTimes = function () {
        return stopTimes;
    };

    this.getShape = function () {
        var shapeIndex = tripGroup[getTripGroupArrayKey('shape_i')];
        return gtfsRoute.getShape(shapeIndex);
    };

    this.getShapeId = function () {
        var shapeIndex = tripGroup[getTripGroupArrayKey('shape_i')];
        return gtfsRoute.getId() + ':' + shapeIndex;
    };

    this.getStopDistances = function () {
        var stopDistancesIndex = tripGroup[getTripGroupArrayKey('stop_distances_i')];
        return gtfsRoute.getStopDistances(stopDistancesIndex);
    };

    function getTripGroupArrayKey(keyId) {
        return gtfsRoot.getArrayKeys('trip_group')[keyId];
    }

    this.isActive = function (dateString) { // dateString = YYYYMMDD
        var exceptionDates = getExceptionDates();

        if (exceptionDates.added.indexOf(dateString) !== -1) {
            return true;
        } else if (exceptionDates.removed.indexOf(dateString) !== -1) {
            return false;
        } else if (isWeekDayInWeekDays(getDateWeekDay(dateString))) {
            var startDay = getStartDay();
            var endDay = getEndDay();
            return ((dateString >= startDay) && (dateString <= endDay));
        } else {
            return false;
        }
    };

    function getDateWeekDay(dateString) { // dateString = YYYYMMDD
        var date = new Date(dateString.substring(0, 4), dateString.substring(4, 6) - 1,
                            dateString.substring(6, 8));
        return (date.getDay() + 6) % 7; // 0=Monday
    }

    function isWeekDayInWeekDays(weekDay) {
        var weekDays = getWeekDays();
        if (weekDays === null) {
            return false;
        } else {
            if (typeof weekDays === 'number') {
                return weekDays === weekDay;
            } else {
                return weekDays.charAt(weekDay) === '1';
            }
        }
    }

    function getTripDates() {
        var tripDatesIndex = tripGroup[getTripGroupArrayKey('trip_dates_i')];
        return gtfsRoute.getTripDates(tripDatesIndex);
    }

    function getTripDatesArrayKey(keyId) {
        return gtfsRoot.getArrayKeys('trip_dates')[keyId];
    }

    function getStartDay() {
        var tripDates = getTripDates();
        var startDayIndex = tripDates[getTripDatesArrayKey('start_date_i')];
        return gtfsRoot.getDates()[startDayIndex];
    }

    function getEndDay() {
        var tripDates = getTripDates();
        var endDayIndex = tripDates[getTripDatesArrayKey('end_date_i')];
        return gtfsRoot.getDates()[endDayIndex];
    }

    function getWeekDays() {
        var tripDates = getTripDates();
        return tripDates[getTripDatesArrayKey('weekdays')];
    }

    function getExceptionDates() {
        var tripDates = getTripDates();
        var addedDates = tripDates[getTripDatesArrayKey('added')];
        var removedDates = tripDates[getTripDatesArrayKey('removed')];
        return {added: getDateStrings(addedDates), removed: getDateStrings(removedDates)};
    }

    function getDateStrings(dateIndexes) {
        var rootDates = gtfsRoot.getDates();
        var dateStrings = [];
        for (var i = 0; i < dateIndexes.length; i++) {
            dateStrings.push(rootDates[dateIndexes[i]]);
        }
        return dateStrings;
    }
}
