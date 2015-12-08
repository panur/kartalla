/* Author: Panu Ranta, panu.ranta@iki.fi */

function Map(master) {
  var that = this; /* http://javascript.crockford.com/private.html */
  var state = getState();

  function getState() {
    var s = {};

    s.initialStatistics = document.getElementById("statistics").innerHTML;

    s.initialZL = 10;
    s.initialLatLng = new google.maps.LatLng(60.273969, 24.791911);
    s.zoomToPointZoomLevel = 14;
    s.ticks = {tick: 0};
    s.route = null;
    s.marker = null;

    return s;
  }

  this.init = function () {
    master.gm.setOptions({center: state.initialLatLng, zoom: state.initialZL});
    window.onresize = function () {that.resizeMap()};
    setStatus('tbd');
    that.resizeMap();
    huppa2();
    //huppa();
  }

    function huppa2() {
        var gtfs = new Gtfs();
        var readyEvent = document.createEvent('Event');
        readyEvent.initEvent('gtfsIsReady', false, false);
        document.addEventListener('gtfsIsReady', function (e) {start(gtfs);}, false);
        gtfs.init('json/132.json', readyEvent);
    }

    function start(gtfs) {
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

  function huppa() {
    var huppaCoordinates = [];
    for (var i = 0; i < points.length; i++) {
      var lup = new google.maps.LatLng(points[i][0], points[i][1]);
      huppaCoordinates.push(lup);
    }

    var duppa = google.maps.geometry.spherical.computeLength(huppaCoordinates);
    console.info('duppa: ' + duppa);

    var encodedHuppa =
      google.maps.geometry.encoding.encodePath(huppaCoordinates);

    var huppaPath = new google.maps.Polyline({
      path: huppaCoordinates,
      map: master.gm,
      strokeColor: '#FF0000',
      strokeOpacity: 1.0,
      strokeWeight: 2
    });
/*
    var huppaPath2 = new google.maps.Polyline({
      path: google.maps.geometry.encoding.decodePath(encodedHuppa),
      map: master.gm,
      strokeColor: '#00FF00',
      strokeOpacity: 1.0,
      strokeWeight: 2
    });
*/
    var euppa = '}vfnJsldwC{@eBMx@jDzNfBbGv@f@hHpDz@Nz@\\x@Vp@fD\\dD@jCt@dSVxXLzXkAdA}@fAiAxAgApBgAxCs@lCa@pBa@nCa@rFY|FM~EGnE@hFLtGV~GxHhvAvApUl@pI~@nKdAzJjBzOdB|MpAdMTrDHfCHtFCpGOvFMfCk@vG}BdUkA~L{Il}@}CpXwAnJuBrLaAnG_AvHe@zE_AzKm@fJoA~UcAbGaAzE@h@_@`C[tEK~EGrLNzq@AxBlAbKVzM\\pOTpEr@xPp@hSPdJHtJDvM@n\\DdMLpKR|J\\nJl@vMtB|^h@zHXbGxBvi@h@rUR|GAjMQ`B_@pAQVSL[C[g@Q}@Ag@Di@j@yCrEPbEh@x@NzARbBj@hAv@xAlAdAj@`@\\pAzArCjC`BpAbADl@QhHfk@z@m@xEgEpOgMBK`As@xAsBZ[DD|CwEv@iBlEyLbAcBv@aAx@q@vAzKb@lCv@zAhGtF`@`ARjBXnH\\vKAfAI~@k@|CgAxHi@xCWz@iBzBqErEqAhAuAzBsAlEm@bBiAlCUb@]~@SfAK|AA~ALzEGjB]|Ay@dAiE`Da@^g@ZeAx@eHrGwD|CmAt@u@^uCTeAAgAYgBOcA`@}D|Ds@v@uG~K[p@iAzAa@^a@h@';

    var huppaPath3 = new google.maps.Polyline({
      path: google.maps.geometry.encoding.decodePath(euppa),
      map: master.gm,
      strokeColor: '#0000FF',
      strokeOpacity: 1.0,
      strokeWeight: 2
    });

    state.route = huppaPath.getPath();

    // window.setInterval(function () {processTick();}, 2000);
  }
/*
var dists = [
  [2, 0.5650],
  [2, 1.4520],
  [3, 5.7180],

0: 0/8 * 5650
1: 1/8 * 5650
2: 2/8 * 5650
3: 3/8 * 5650
4: 4/8 * 5650 = 1/2 * 5650 = 5650 / 2
5: 5/8 * 5650
6: 6/8 * 5650
7: 7/8 * 5650
8: 8/8 * 5650 = 1 * 5650 = 5650 / 1

*/
  function processTick() {
    var secondsFromStart = 1080 + state.ticks.tick * 15;
    var distance = getDistance(secondsFromStart, huppaMinutes, huppaDistances);

    updateMarker(getPathLatLng(state.route, distance), distance);

    state.ticks.tick += 1;
  }

  function getDistance(secondsFromStart, deltaMinutes, deltaDistances) {
    var distance = 0;
    var cumulSeconds = 0;
    var cumulDistance = 0;

    for (var i = 0; i < deltaMinutes.length; i++) {
      var secondsInc = deltaMinutes[i] * 60;
      cumulSeconds += secondsInc;
      var distanceInc = deltaDistances[i];
      cumulDistance += distanceInc;
      if (cumulSeconds <= secondsFromStart) {
        if (cumulSeconds == secondsFromStart) {
          distance = cumulDistance;
          //console.info('d: ' + distance);
          break;
        }
      } else {
        var secondsSincePreviousDelta =
          secondsFromStart - (cumulSeconds - secondsInc);
        var fraction = secondsSincePreviousDelta / secondsInc;
        distance = (cumulDistance - distanceInc) + (fraction * distanceInc);
        break;
      }
    }

    distance = Math.round(distance);
    time = Math.floor(secondsFromStart / 60) + ':' + secondsFromStart % 60;
    setStatus('time: ' + time + ', d: ' + distance);

    return distance;
  }

  function getPathLatLng(path, distanceFromStart) {
    var cumulDistance = 0;

    for (var i = 1; i < path.getLength(); i++) {
      var p1 = path.getAt(i - 1);
      var p2 = path.getAt(i);
      var distanceInc =
        google.maps.geometry.spherical.computeDistanceBetween(p1, p2);
      cumulDistance += distanceInc;
      if (cumulDistance > distanceFromStart) {
        var distanceFromP1 =
          (distanceFromStart - (cumulDistance - distanceInc));
        var fraction = distanceFromP1 / distanceInc;
        return google.maps.geometry.spherical.interpolate(p1, p2, fraction);
      }
    }

    console.info('hup: ' + path.getLength());

    return path.getAt(0);
  }

  function updateMarker(latLng, distance) {
    if (state.marker != null) {
      state.marker.setMap(null);
    }

    console.info('ll: ' + latLng + ', d: ' + distance);

    state.marker = new google.maps.Marker({
      position: latLng,
      map: master.gm,
      title: 'd: ' + distance
    });
  }

  function setStatus(statusBarHtml) {
    document.getElementById("status_bar").innerHTML = statusBarHtml;
  }

  function setCenter(latLng, zoom) {
    /* http://code.google.com/p/gmaps-api-issues/issues/detail?id=2673 */
    if (zoom != master.gm.getZoom()) {
      master.gm.setZoom(zoom);
    }
    master.gm.panTo(latLng);
  }

  this.zoomToPoint = function (latLng) {
    setCenter(latLng, state.zoomToPointZoomLevel);
  }

  this.resizeMap = function () {
    that.resizeDivs();
  }

  this.resizeDivs = function () {
    resizeMapCanvas();
  }

  function resizeMapCanvas() {
    document.getElementById("map_canvas").style.height =
      document.documentElement.clientHeight -
      document.getElementById("status_bar").clientHeight -
      document.getElementById("statistics").clientHeight + "px";

    google.maps.event.trigger(master.gm, "resize");
  }

  this.resetLocationAndZoom = function () {
    setCenter(state.initialLatLng, state.initialZL);
  }
}
