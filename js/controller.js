/* Author: Panu Ranta, panu.ranta@iki.fi */

function Controller(gtfs, map) {
    var that = this; /* http://javascript.crockford.com/private.html */
    var state = getState();

    function getState() {
        var s = {};
        s.initialStatistics = document.getElementById("statistics").innerHTML;
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
                        console.log('startTime: %o, %o',
                                    activeTrips[k].getStartTime(), activeTrips[k].getStopTimes());
                    }
                }
            }
        }
    }
}
