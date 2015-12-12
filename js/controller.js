/* Author: Panu Ranta, panu.ranta@iki.fi */

function Controller(gtfs, map) {
    var that = this; /* http://javascript.crockford.com/private.html */
    var state = getState();

    function getState() {
        var s = {};
        s.initialStatistics = document.getElementById("statistics").innerHTML;
        s.ticks = {tick: 0};
        s.activeTrips = [];
        return s;
    }

    this.init = function () {
        //huppa();
    }

    this.start = function () {
        console.log('start');
        var routes = gtfs.getRoutes();
        for (var i = 0; i < routes.length; i++) {
            if (routes[i].getName() == '132') {
                var activeServices = routes[i].getActiveServices();
                console.log('activeServices.length: %d', activeServices.length);
                for (var j = 0; j < activeServices.length; j++) {
                    var activeTrips = activeServices[j].getActiveTrips();
                    console.log('activeServices[%d].activeTrips.length: %d', j, activeTrips.length);
                    for (var k = 0; k < activeTrips.length; k++) {
                        var tripPath = map.decodePath(activeTrips[k].getShape());
                        var distances = map.getDistances(tripPath,
                                                         activeTrips[k].getStopDistances());
                        var activeTrip = new ControllerTrip(map, tripPath, distances,
                                                            activeTrips[k].getStopTimes());
                        state.activeTrips.push(activeTrip);
                    }
                }
            }
        }
        window.setInterval(function () {processTick();}, 1000);
    }

    function processTick() {
        var secondsFromStart = 0 + state.ticks.tick * 15;

        for (var i = 0; i < state.activeTrips.length; i++) {
            state.activeTrips[i].update(secondsFromStart);
        }

        state.ticks.tick += 1;
    }
}

function ControllerTrip(map, tripPath, stopDistances, stopTimes) {
    var that = this;
    var state = getState();

    function getState() {
        var s = {};
        s.timesAndDistances = mergeStopTimesAndDistances(stopTimes, stopDistances);
        s.marker = null;
        return s;
    }

    function mergeStopTimesAndDistances(times, distances) {
        var timesAndDistances = [];
        while (times.length > 3) {
            if (times[times.length - 1] == times[times.length - 2]) {
                times.splice(times.length - 2, 1);
                distances.splice(distances.length - 2, 1);
            } else {
                break;
            }
        }

        for (var i = 1; i < times.length; i++) {
            if ((i < (times.length - 1)) && (times[i] == times[i + 1])) {
                var distance = Math.round((distances[i] + distances[i + 1]) / 2);
                timesAndDistances.push([times[i], distance]);
                i++;
            } else {
                timesAndDistances.push([times[i], distances[i]]);
            }
        }
        return timesAndDistances;
    }

    this.update = function (secondsFromStart) {
        var distance = getDistance(secondsFromStart, state.timesAndDistances);
        if (state.marker != null) {
            map.removeMarker(state.marker);
        }
        state.marker = map.addMarker(tripPath, distance);
    }

    function getDistance(secondsFromStart, timesAndDistances) {
        var distance = 0;
        var cumulSeconds = 0;
        var cumulDistance = 0;

        for (var i = 0; i < timesAndDistances.length - 1; i++) {
            var secondsInc = (timesAndDistances[i + 1][0] - timesAndDistances[i][0]) * 60;
            cumulSeconds += secondsInc;
            var distanceInc = (timesAndDistances[i + 1][1] - timesAndDistances[i][1]);
            cumulDistance += distanceInc;
            if (cumulSeconds <= secondsFromStart) {
                if (cumulSeconds == secondsFromStart) {
                    distance = cumulDistance;
                    break;
                }
            } else {
                var secondsSincePreviousDelta = secondsFromStart - (cumulSeconds - secondsInc);
                var fraction = secondsSincePreviousDelta / secondsInc;
                distance = (cumulDistance - distanceInc) + (fraction * distanceInc);
                break;
            }
        }

        return Math.round(distance);
    }
}
