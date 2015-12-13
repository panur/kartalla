/* Author: Panu Ranta, panu.ranta@iki.fi */

'use strict';  // tbd

function Gtfs() {
    var that = this;
    var state = getState();

    function getState() {
        var s = {};
        s.root = null;
        return s;
    }

    this.init = function (jsonData) {
        state.root = jsonData;
    }

    // 0=dates, 1=routes
    this.getDates = function () {
        return state.root[0];
    }

    this.getRoutes = function () {
        var routes = [];
        for (var i = 0; i < state.root[1].length; i++) {
            var route = new GtfsRoute(i, that, getRootRoute(i));
            routes.push(route);
        }
        return routes;
    }

    function getRootRoute(routeIndex) {
        return state.root[1][routeIndex];
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

    // 0=name, 1=type, 2=shapes, 3=directions, 4=services
    this.getName = function () {
        return rootRoute[0];
    }

    this.getShape = function (shapeIndex) {
        return rootRoute[2][shapeIndex];
    }

    this.getDirections = function () {
        return rootRoute[3];
    }

    function getServices() {
        return rootRoute[4];
    }
}

function GtfsService(serviceId, gtfsRoot, gtfsRoute, rootService) {
    var that = this;

    this.getId = function () {
        return serviceId + '_' + gtfsRoute.getId();
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
            var direction = new GtfsDirection(i, gtfsRoot, that, serviceDirections[i]);
            activeTrips = activeTrips.concat(direction.getActiveTrips(fromMinutesAfterMidnight,
                                                                      toMinutesAfterMidnight));
        }
        return activeTrips;
    }

    function getServiceDirections() {
        var directionsI = getDirectionsI();
        var routeDirections = gtfsRoute.getDirections();
        return routeDirections[directionsI];
    }

    // 0=start_date_i, 1=end_date_i, 2=weekday, 3=exception_dates, 4=directions_i
    function getStartDay() {
        return gtfsRoot.getDates()[rootService[0]];
    }

    function getEndDay() {
        return gtfsRoot.getDates()[rootService[1]];
    }

    function getWeekDay() {
        return rootService[2]; // 0=Monday
    }

    function getExceptionDates() {
        var exceptionDates = rootService[3];
        var addedDates = exceptionDates[0];
        var removedDates = exceptionDates[1];
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
        return rootService[4];
    }
}

function GtfsDirection(directionId, gtfsRoot, gtfsService, rootDirection) {
    var that = this;

    this.getId = function () {
        return directionId + '_' + gtfsService.getId();
    }

    // 0=shape_i, 1=stop_distances, 2=is_departure_times, 3=stop_times, 4=trips
    this.getShape = function () {
        return gtfsService.getShape(rootDirection[0]);
    }

    this.getActiveTrips = function (fromMinutesAfterMidnight, toMinutesAfterMidnight) {
        var activeTrips = [];
        var directionTrips = rootDirection[4];
        var firstStartTime = directionTrips[0];
        var startTimes =
            gtfsRoot.unpack_delta_list(gtfsRoot.string_to_integer_list(directionTrips[1]));
        var stopTimesIndexes = gtfsRoot.string_to_integer_list(directionTrips[2]);

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
        var isDepartureTimes = rootDirection[2];
        var stopTimeDeltas = gtfsRoot.string_to_integer_list(rootDirection[3][stopTimesI]);
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
        return gtfsRoot.unpack_delta_list(gtfsRoot.string_to_integer_list(rootDirection[1]));
    }
}

function GtfsTrip(tripId, gtfsDirection, startTime, stopTimes) {
    var that = this;

    this.getId = function () {
        return tripId + '_' + gtfsDirection.getId();
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

    this.getStopDistances = function () {
        return gtfsDirection.getStopDistances();
    }
}
