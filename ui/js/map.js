/* Author: Panu Ranta, panu.ranta@iki.fi, http://14142.net/kartalla/about.html */

/* Show markers on Google Maps
API Reference: https://developers.google.com/maps/documentation/javascript/reference
*/

function Map() {
    var that = this;
    var state = getState();

    function getState() {
        var s = {};
        s.gm = null;
        s.polylineCache = {}
        return s;
    }

    this.init = function (lat, lng, zoomLevel) {
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

        state.gm.setOptions({center: new google.maps.LatLng(lat, lng), zoom: zoomLevel});
    }

    this.resize = function (newHeight) {
        state.gm.getDiv().style.height = newHeight + 'px';
        google.maps.event.trigger(state.gm, 'resize');
    }

    this.decodePath = function (encodedPath) {
        return google.maps.geometry.encoding.decodePath(encodedPath);
    }

    this.addMarker = function (path, pathId, isVisible, color) {
        var gmMarker = new google.maps.Marker({
            map: state.gm,
            visible: isVisible
        });
        var gmSymbol = {
            strokeColor: color,
            strokeWeight: 2,
            scale: 5
        };
        if (state.polylineCache[pathId] === undefined) {
            var newPolyline = new google.maps.Polyline({
                path: path,
                visible: isVisible,
                strokeColor: 'black',
                strokeOpacity: 1.0,
                strokeWeight: 1
            });
            state.polylineCache[pathId] = {polyline: newPolyline, count: 1};
        } else {
            state.polylineCache[pathId].count += 1;
        }

        var gmPolyline = state.polylineCache[pathId].polyline;
        return {gmMarker: gmMarker, gmSymbol: gmSymbol, gmPolyline: gmPolyline, pathId: pathId};
    }

    this.updateMarker = function (marker, distanceFromStart, opacity, title) {
        var distance = getPathPositionAndHeading(marker.gmPolyline.getPath(), distanceFromStart);
        var paths = [google.maps.SymbolPath.FORWARD_CLOSED_ARROW, google.maps.SymbolPath.CIRCLE];

        marker.gmSymbol.path = paths[~~(opacity < 1)];
        marker.gmSymbol.strokeOpacity = opacity;
        marker.gmSymbol.rotation = distance.heading;

        marker.gmMarker.setOptions({icon: marker.gmSymbol, position: distance.position,
                                    title: title});

        if (marker.gmPolyline.getMap() === undefined) {
            marker.gmPolyline.setMap(state.gm);
        }
    }

    function getPathPositionAndHeading(path, distanceFromStart) {
        var cumulDistance = 0;

        for (var i = 1; i < path.getLength(); i++) {
            var p1 = path.getAt(i - 1);
            var p2 = path.getAt(i);
            var distanceInc = google.maps.geometry.spherical.computeDistanceBetween(p1, p2);
            cumulDistance += distanceInc;
            if (cumulDistance > distanceFromStart) {
                var distanceFromP1 = (distanceFromStart - (cumulDistance - distanceInc));
                var fraction = distanceFromP1 / distanceInc;
                var position = google.maps.geometry.spherical.interpolate(p1, p2, fraction);
                var heading = google.maps.geometry.spherical.computeHeading(p1, p2);
                return {position: position, heading: heading};
            }
        }

        var p1 = path.getAt(path.getLength() - 2);
        var p2 = path.getAt(path.getLength() - 1);
        return {position: p2, heading: google.maps.geometry.spherical.computeHeading(p1, p2)};
    }

    this.removeMarker = function (marker) {
        marker.gmMarker.setMap(null);
        marker.gmMarker = null;

        state.polylineCache[marker.pathId].count -= 1;
        if (state.polylineCache[marker.pathId].count == 0) {
            marker.gmPolyline.setMap(null);
            marker.gmPolyline = null;
            delete state.polylineCache[marker.pathId];
        }
    }

    this.setMarkerVisibility = function (marker, isVisible) {
        marker.gmMarker.setVisible(isVisible);
        marker.gmPolyline.setVisible(isVisible);
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
