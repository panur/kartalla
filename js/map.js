/* Author: Panu Ranta, panu.ranta@iki.fi */

function Map() {
    var that = this;
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

    this.init2 = function () {
    }

    this.init = function () {
        var gmElement = document.getElementById("map_canvas");
        var gmOptions = {
            mapTypeId: google.maps.MapTypeId.ROADMAP,
            mapTypeControlOptions: {style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR},
            zoomControlOptions: {style: google.maps.ZoomControlStyle.DEFAULT},
            panControl: true,
            zoomControl: true,
            scaleControl: true,
            streetViewControl: true,
            styles: [{
                featureType: "road.arterial",
                elementType: "geometry.fill",
                stylers: [{color: "#FBF8A5" }]
            }]
        };

        state.gm = new google.maps.Map(gmElement, gmOptions);

        state.gm.setOptions({center: state.initialLatLng, zoom: state.initialZL});
        window.onresize = function () {that.resizeMap()};
        setStatus('tbd');
        that.resizeMap();
    }

    this.decodePath = function (encodedPath) {
        return google.maps.geometry.encoding.decodePath(encodedPath);
    }

    this.removeMarker = function (marker) {
        marker.setMap(null);
    }

    this.addMarker = function (path, distance) {
        var marker = new google.maps.Marker({
            position: getPathLatLng(new google.maps.MVCArray(path), distance),
            map: state.gm,
            title: 'd: ' + distance
        });
        return marker;
    }

    this.addPolyline = function (path, color) {
        var polyline = new google.maps.Polyline({
            path: path,
            map: state.gm,
            strokeColor: color,
            strokeOpacity: 1.0,
            strokeWeight: 2
        });
        return polyline;
    }

    this.getDistances = function (path, pathIndexes) {
        var distances = [0]
        var distanceFromStart = 0;

        for (var i = 1, j = 1; i < path.length; i++) {
            var p1 = path[i - 1];
            var p2 = path[i];
            var distanceInc = google.maps.geometry.spherical.computeDistanceBetween(p1, p2);
            distanceFromStart += distanceInc;
            if (i == pathIndexes[j]) {
                j += 1;
                distances.push(Math.round(distanceFromStart));
            }
        }

        return distances;
    }

    function getPathLatLng(path, distanceFromStart) {
        var cumulDistance = 0;

        for (var i = 1; i < path.getLength(); i++) {
            var p1 = path.getAt(i - 1);
            var p2 = path.getAt(i);
            var distanceInc = google.maps.geometry.spherical.computeDistanceBetween(p1, p2);
            cumulDistance += distanceInc;
            if (cumulDistance > distanceFromStart) {
                var distanceFromP1 = (distanceFromStart - (cumulDistance - distanceInc));
                var fraction = distanceFromP1 / distanceInc;
                return google.maps.geometry.spherical.interpolate(p1, p2, fraction);
            }
        }

        return path.getAt(path.getLength() - 1);
    }

    function setStatus(statusBarHtml) {
        document.getElementById("status_bar").innerHTML = statusBarHtml;
    }

    function setCenter(latLng, zoom) {
        /* http://code.google.com/p/gmaps-api-issues/issues/detail?id=2673 */
        if (zoom != state.gm.getZoom()) {
            state.gm.setZoom(zoom);
        }
        state.gm.panTo(latLng);
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

        google.maps.event.trigger(state.gm, "resize");
  }

    this.resetLocationAndZoom = function () {
        setCenter(state.initialLatLng, state.initialZL);
    }
}
