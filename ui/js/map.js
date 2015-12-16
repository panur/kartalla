/* Author: Panu Ranta, panu.ranta@iki.fi */

/* Show markers on Google Maps
API Reference: https://developers.google.com/maps/documentation/javascript/reference
*/

function Map() {
    var that = this;
    var state = getState();

    function getState() {
        var s = {};
        s.initialZL = 10;
        s.initialLatLng = new google.maps.LatLng(60.273969, 24.791911);
        return s;
    }

    this.init = function () {
        var gmElement = document.getElementById('map_canvas');
        var gmOptions = {
            mapTypeId: google.maps.MapTypeId.ROADMAP,
            mapTypeControlOptions: {style: google.maps.MapTypeControlStyle.HORIZONTAL_BAR},
            zoomControlOptions: {style: google.maps.ZoomControlStyle.DEFAULT},
            panControl: true,
            zoomControl: true,
            scaleControl: true,
            streetViewControl: true,
            styles: [{
                featureType: 'road.arterial',
                elementType: 'geometry.fill',
                stylers: [{color: '#FBF8A5' }]
            }]
        };

        state.gm = new google.maps.Map(gmElement, gmOptions);

        state.gm.setOptions({center: state.initialLatLng, zoom: state.initialZL});
    }

    this.resize = function (newHeight) {
        state.gm.getDiv().style.height = newHeight + 'px';
        google.maps.event.trigger(state.gm, 'resize');
    }

    this.decodePath = function (encodedPath) {
        return google.maps.geometry.encoding.decodePath(encodedPath);
    }

    this.addPolyline = function (path, isVisible) {
        var polyline = new google.maps.Polyline({
            path: path,
            map: state.gm,
            visible: isVisible,
            strokeColor: 'black',
            strokeOpacity: 1.0,
            strokeWeight: 1
        });
        return polyline;
    }

    this.updatePolyline = function (polyline, distance, color, opacity) {
        var paths = [google.maps.SymbolPath.FORWARD_CLOSED_ARROW, google.maps.SymbolPath.CIRCLE];
        var lineSymbol = {
            path: paths[~~(opacity < 1)],
            strokeOpacity: opacity,
            strokeColor: color,
            strokeWeight: 2,
            scale: 5
        };
        var length = google.maps.geometry.spherical.computeLength(polyline.getPath());
        var offset = Math.min(100, ((distance / length) * 100)) + '%';
        polyline.setOptions({icons: [{icon: lineSymbol, offset: offset}]});
    }

    this.removePolyline = function (polyline) {
        polyline.setMap(null);
    }

    this.setPolylineVisibility = function (polyline, isVisible) {
        polyline.setVisible(isVisible);
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
}
