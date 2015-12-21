/* Author: Panu Ranta, panu.ranta@iki.fi, http://14142.net/kartalla/about.html */

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

    this.getActiveServices = function (dateString) { // dateString = YYYYMMDD
        var activeServices = [];
        for (var i = 0; i < getServices().length; i++) {
            var service = new GtfsService(i, gtfsRoot, that, getRootService(i));
            if (service.isActive(dateString)) {
                activeServices.push(service);
            }
        }
        return activeServices;
    };

    function getRootService(serviceIndex) {
        return getServices()[serviceIndex];
    }

    function getArrayKey(keyId) {
        return gtfsRoot.getArrayKeys('route')[keyId];
    }

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

    this.getDirections = function () {
        return rootRoute[getArrayKey('directions')];
    };

    function getServices() {
        return rootRoute[getArrayKey('services')];
    }
}

function GtfsService(serviceId, gtfsRoot, gtfsRoute, rootService) {
    var that = this;

    this.getId = function () {
        return gtfsRoute.getId() + '_' + serviceId;
    };

    this.getName = function () {
        return gtfsRoute.getName();
    };

    this.getLongName = function () {
        return gtfsRoute.getLongName();
    };

    this.getType = function () {
        return gtfsRoute.getType();
    };

    this.getShape = function (shapeIndex) {
        return gtfsRoute.getShape(shapeIndex);
    };

    this.isActive = function (dateString) {  // dateString = YYYYMMDD
        var exceptionDates = getExceptionDates();

        if (exceptionDates.added.indexOf(dateString) !== -1) {
            return true;
        } else if (exceptionDates.removed.indexOf(dateString) !== -1) {
            return false;
        } else if (getWeekDay() === getDateWeekDay(dateString)) {
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

    this.getActiveTrips = function (fromMinutesAfterMidnight, toMinutesAfterMidnight) {
        var activeTrips = [];
        var serviceDirections = getServiceDirections();
        for (var i = 0; i < serviceDirections.length; i++) {
            if (serviceDirections[i].length > 0) { // some services operate only in one direction
                var direction = new GtfsDirection(i, gtfsRoot, that, serviceDirections[i]);
                activeTrips = activeTrips.concat(direction.getActiveTrips(fromMinutesAfterMidnight,
                                                                          toMinutesAfterMidnight));
            }
        }
        return activeTrips;
    };

    function getServiceDirections() {
        var directionsI = getDirectionsI();
        var routeDirections = gtfsRoute.getDirections();
        return routeDirections[directionsI];
    }

    function getArrayKey(keyId) {
        return gtfsRoot.getArrayKeys('service')[keyId];
    }

    function getExceptionDatesArrayKey(keyId) {
        return gtfsRoot.getArrayKeys('exception_dates')[keyId];
    }

    function getStartDay() {
        return gtfsRoot.getDates()[rootService[getArrayKey('start_date_i')]];
    }

    function getEndDay() {
        return gtfsRoot.getDates()[rootService[getArrayKey('end_date_i')]];
    }

    function getWeekDay() {
        return rootService[getArrayKey('weekday')]; // 0=Monday
    }

    function getExceptionDates() {
        var exceptionDates = rootService[getArrayKey('exception_dates')];
        var addedDates = exceptionDates[getExceptionDatesArrayKey('added')];
        var removedDates = exceptionDates[getExceptionDatesArrayKey('removed')];
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

    function getDirectionsI() {
        return rootService[getArrayKey('directions_i')];
    }
}

function GtfsDirection(directionId, gtfsRoot, gtfsService, rootDirection) {
    var that = this;

    this.getId = function () {
        return gtfsService.getId() + '_' + directionId;
    };

    this.getName = function () {
        return gtfsService.getName();
    };

    this.getLongName = function () {
        return gtfsService.getLongName();
    };

    this.getDirection = function () {
        return ['->', '<-'][directionId];
    };

    this.getType = function () {
        return gtfsService.getType();
    };

    function getArrayKey(keyId) {
        return gtfsRoot.getArrayKeys('direction')[keyId];
    }

    function getTripArrayKey(keyId) {
        return gtfsRoot.getArrayKeys('trip')[keyId];
    }

    this.getShape = function () {
        return gtfsService.getShape(rootDirection[getArrayKey('shape_i')]);
    };

    this.getShapeId = function () {
        return that.getId() + ':' + rootDirection[getArrayKey('shape_i')];
    };

    this.getActiveTrips = function (fromMinutesAfterMidnight, toMinutesAfterMidnight) {
        var activeTrips = [];
        var directionTrips = rootDirection[getArrayKey('trips')];
        var firstStartTime = directionTrips[getTripArrayKey('first_start_time')];
        var startTimesString = directionTrips[getTripArrayKey('start_times')];
        var startTimes =
            gtfsRoot.unpackDeltaList(gtfsRoot.stringToIntegerList(startTimesString));
        var stopTimesIndexesString = directionTrips[getTripArrayKey('stop_times_indexes')];
        var stopTimesIndexes = gtfsRoot.stringToIntegerList(stopTimesIndexesString);

        for (var i = 0; i < startTimes.length; i++) {
            var startTime = firstStartTime + startTimes[i];
            var stopTimes = getStopTimes(stopTimesIndexes[i]);
            if ((startTime <= toMinutesAfterMidnight) &&
                ((startTime + stopTimes[stopTimes.length - 1]) > fromMinutesAfterMidnight)) {
                var artiveTrip = new GtfsTrip(i, that, startTime, stopTimes);
                activeTrips.push(artiveTrip);
            }
        }
        return activeTrips;
    }

    function getStopTimes(stopTimesI) {
        var isDepartureTimes = rootDirection[getArrayKey('is_departure_times')];
        var stopTimeDeltas =
            gtfsRoot.stringToIntegerList(rootDirection[getArrayKey('stop_times')][stopTimesI]);
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

    this.getStopDistances = function () {
        var stopDistancesString = rootDirection[getArrayKey('stop_distances')];
        return gtfsRoot.unpackDeltaList(gtfsRoot.stringToIntegerList(stopDistancesString));
    };
}

function GtfsTrip(tripId, gtfsDirection, startTime, stopTimes) {
    var that = this;

    this.getId = function () {
        return gtfsDirection.getId() + '_' + tripId;
    };

    this.getName = function () {
        return gtfsDirection.getName();
    };

    this.getLongName = function () {
        return gtfsDirection.getLongName();
    };

    this.getDirection = function () {
        return gtfsDirection.getDirection();
    };

    this.getType = function () {
        return gtfsDirection.getType();
    };

    this.getStartTime = function () {
        return startTime;
    };

    this.getStopTimes = function () {
        return stopTimes;
    };

    this.getShape = function () {
        return gtfsDirection.getShape();
    };

    this.getShapeId = function () {
        return gtfsDirection.getShapeId();
    };

    this.getStopDistances = function () {
        return gtfsDirection.getStopDistances();
    };
}
