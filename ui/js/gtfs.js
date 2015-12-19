/* Author: Panu Ranta, panu.ranta@iki.fi */

'use strict';  // tbd

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
    }

    this.getArrayKeys = function (node) {
        return state.arrayKeys[node];
    }

    function getArrayKey(keyId) {
        return that.getArrayKeys('root')[keyId];
    }

    this.getDates = function () {
        return state.root[getArrayKey('dates')];
    }

    this.getRoutes = function () {
        var routes = [];
        for (var i = 0; i < state.root[getArrayKey('routes')].length; i++) {
            var route = new GtfsRoute(i, that, getRootRoute(i));
            routes.push(route);
        }
        return routes;
    }

    function getRootRoute(routeIndex) {
        return state.root[getArrayKey('routes')][routeIndex];
    }

    // For '#$%1~!$2!~!!$3' return [0, 1, 2, 14, 91, 92, 15, 182, 183, 16].
    this.string_to_integer_list = function (string) {
        var integer_list = [];
        var integer_value = 0;
        var mult_chr = 33; // 33='!'
        var min_chr = 35;  // 35='#', not 34='"' because it takes three characters in JSON
        var max_chr = 126; // 126='~'
        var max_value = max_chr - min_chr;
        for (var i = 0; i < string.length; i++) {
            var charCode = string.charCodeAt(i);
            if (charCode === mult_chr) {
                integer_value += max_value;
            } else {
                integer_value += charCode - min_chr;
                integer_list.push(integer_value);
                integer_value = 0;
            }
        }
        return integer_list;
    }

    // For [10, 1, 11, 3] return [0, 10, 11, 22, 25]
    this.unpack_delta_list = function (integer_list) {
        var unpacked_list = [0];
        for (var i = 0; i < integer_list.length; i++) {
            unpacked_list.push(unpacked_list[i] + integer_list[i]);
        }
        return unpacked_list;
    }
}

function GtfsRoute(routeId, gtfsRoot, rootRoute) {
    var that = this;

    this.getId = function () {
        return routeId;
    }

    this.getActiveServices = function (dateString) { // dateString = YYYYMMDD
        var activeServices = [];
        for (var i = 0; i < getServices().length; i++) {
            var service = new GtfsService(i, gtfsRoot, that, getRootService(i));
            if (service.isActive(dateString)) {
                activeServices.push(service);
            }
        }
        return activeServices;
    }

    function getRootService(serviceIndex) {
        return getServices()[serviceIndex];
    }

    function getArrayKey(keyId) {
        return gtfsRoot.getArrayKeys('route')[keyId];
    }

    this.getName = function () {
        return rootRoute[getArrayKey('name')];
    }

    this.getType = function () {
        return rootRoute[getArrayKey('type')];
    }

    this.getShape = function (shapeIndex) {
        return rootRoute[getArrayKey('shapes')][shapeIndex];
    }

    this.getDirections = function () {
        return rootRoute[getArrayKey('directions')];
    }

    function getServices() {
        return rootRoute[getArrayKey('services')];
    }
}

function GtfsService(serviceId, gtfsRoot, gtfsRoute, rootService) {
    var that = this;

    this.getId = function () {
        return gtfsRoute.getId() + '_' + serviceId;
    }

    this.getName = function () {
        return gtfsRoute.getName();
    }

    this.getType = function () {
        return gtfsRoute.getType();
    }

    this.getShape = function (shapeIndex) {
        return gtfsRoute.getShape(shapeIndex);
    }

    this.isActive = function (dateString) {  // dateString = YYYYMMDD
        var exceptionDates = getExceptionDates();

        if (exceptionDates.added.indexOf(dateString) != -1) {
            return true;
        } else if (exceptionDates.removed.indexOf(dateString) != -1) {
            return false;
        } else if (getWeekDay() === getDateWeekDay(dateString)) {
            var startDay = getStartDay();
            var endDay = getEndDay();
            return ((dateString >= startDay) && (dateString <= endDay));
        } else {
            return false;
        }
    }

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
    }

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
    }

    this.getName = function () {
        return gtfsService.getName();
    }

    this.getType = function () {
        return gtfsService.getType();
    }

    function getArrayKey(keyId) {
        return gtfsRoot.getArrayKeys('direction')[keyId];
    }

    function getTripArrayKey(keyId) {
        return gtfsRoot.getArrayKeys('trip')[keyId];
    }

    this.getShape = function () {
        return gtfsService.getShape(rootDirection[getArrayKey('shape_i')]);
    }

    this.getShapeId = function () {
        return that.getId() + ':' + rootDirection[getArrayKey('shape_i')];
    }

    this.getActiveTrips = function (fromMinutesAfterMidnight, toMinutesAfterMidnight) {
        var activeTrips = [];
        var directionTrips = rootDirection[getArrayKey('trips')];
        var firstStartTime = directionTrips[getTripArrayKey('first_start_time')];
        var startTimesString = directionTrips[getTripArrayKey('start_times')];
        var startTimes =
            gtfsRoot.unpack_delta_list(gtfsRoot.string_to_integer_list(startTimesString));
        var stopTimesIndexesString = directionTrips[getTripArrayKey('stop_times_indexes')];
        var stopTimesIndexes = gtfsRoot.string_to_integer_list(stopTimesIndexesString);

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
            gtfsRoot.string_to_integer_list(rootDirection[getArrayKey('stop_times')][stopTimesI]);
        var stopTimes = gtfsRoot.unpack_delta_list(stopTimeDeltas);
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
        return gtfsRoot.unpack_delta_list(gtfsRoot.string_to_integer_list(stopDistancesString));
    }
}

function GtfsTrip(tripId, gtfsDirection, startTime, stopTimes) {
    var that = this;

    this.getId = function () {
        return gtfsDirection.getId() + '_' + tripId;
    }

    this.getName = function () {
        return gtfsDirection.getName();
    }

    this.getType = function () {
        return gtfsDirection.getType();
    }

    this.getStartTime = function () {
        return startTime;
    }

    this.getStopTimes = function () {
        return stopTimes;
    }

    this.getShape = function () {
        return gtfsDirection.getShape();
    }

    this.getShapeId = function () {
        return gtfsDirection.getShapeId();
    }

    this.getStopDistances = function () {
        return gtfsDirection.getStopDistances();
    }
}
