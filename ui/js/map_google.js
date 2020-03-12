/* Author: Panu Ranta, panu.ranta@iki.fi, https://14142.net/kartalla/about.html */

/* Show markers on Google Maps
API Reference: https://developers.google.com/maps/documentation/javascript/reference
*/

'use strict';

function MapApiMap() {
    var that = this;
    var state = getState();

    function getState() {
        var s = {};
        s.map = null;
        s.control = null;
        s.ownLocation = null;
        return s;
    }

    this.init = function (lat, lng, zoomLevel, zoomChanged, boundsChanged) {
        var mapElement = document.getElementById('map_canvas');
        var mapOptions = {
            'fullscreenControl': 0,
            'tilt': 0,
            'styles': [{
                'featureType': 'road.arterial',
                'elementType': 'geometry.fill',
                'stylers': [{'color': '#FBF8A5'}]
            }]
        };

        state.map = new google.maps.Map(mapElement, mapOptions);
        state.map.setOptions({'center': new google.maps.LatLng(lat, lng), 'zoom': zoomLevel});
        state.map.addListener('zoom_changed', zoomChanged);
        state.map.addListener('bounds_changed', function () {
            var bounds = state.map.getBounds();
            var sw = bounds.getSouthWest();
            var ne = bounds.getNorthEast();
            boundsChanged(state.map.getZoom(), sw.lat(), sw.lng(), ne.lat(), ne.lng());
        });
    };

    this.getMap = function () {
        return state.map;
    };

    this.restart = function (lat, lng, zoomLevel) {
        state.map.setCenter({'lat': lat, 'lng': lng});
        state.map.setZoom(zoomLevel);
    };

    this.resize = function (newHeight) {
        state.map.getDiv().style.height = newHeight + 'px';
        google.maps.event.trigger(state.map, 'resize');
    };

    this.clearOwnLocation = function () {
        if (state.ownLocation !== null) {
            state.ownLocation.setMap(null);
        }
    };

    this.updateOwnLocation = function (lat, lng, radius, circleOptions) {
        state.ownLocation = new google.maps.Circle({
            'strokeColor': circleOptions['strokeColor'],
            'strokeOpacity': circleOptions['strokeOpacity'],
            'strokeWeight': circleOptions['strokeWeight'],
            'fillColor': circleOptions['fillColor'],
            'fillOpacity': circleOptions['fillOpacity'],
            'map': state.map,
            'center': {'lat': lat, 'lng': lng},
            'radius': radius,
            'clickable': false
        });
        state.map.fitBounds(state.ownLocation.getBounds());
    };

    this.decodePath = function (encodedPath) {
        return google.maps.geometry.encoding.decodePath(encodedPath);
    };

    // path as returned by decodePath()
    this.newPolyline = function (path, polylineOptions) {
        var polyline = new google.maps.Polyline({
            'path': path,
            'geodesic': true,
            'clickable': false, // https://github.com/panur/kartalla/issues/8
            'strokeColor': polylineOptions.color,
            'strokeOpacity': polylineOptions.opacity,
            'strokeWeight': polylineOptions.weight
        });
        return polyline;
    };

    this.getPolylinePath = function (polyline) {
        return polyline.getPath();
    };

    this.setPolylineOptions = function (polyline, polylineOptions) {
        polyline.setOptions({'strokeColor': polylineOptions['color'],
                             'strokeWeight': polylineOptions['weight']});
    };

    this.removePolyline = function (polyline) {
        polyline.setMap(null);
    };

    // polylinePath as returned by getPolylinePath()
    this.getPathLength = function (polylinePath) {
        return polylinePath.getLength();
    };

    // polylinePath as returned by getPolylinePath()
    this.getPathPoint = function (polylinePath, index) {
        return polylinePath.getAt(index);
    };

    this.getPathLatLon = function (polylinePath, index) {
        return new LatLon(polylinePath.getAt(index).lat(), polylinePath.getAt(index).lng());
    };

    this.getLatLng = function (latLon) {
        return new google.maps.LatLng(latLon.lat, latLon.lon);
    };

    this.computeDistance = function (p1, p2) {
        return google.maps.geometry.spherical.computeDistanceBetween(p1, p2)
    };

    this.interpolate = function (p1, p2, fraction) {
        return google.maps.geometry.spherical.interpolate(p1, p2, fraction);
    };

    this.computeHeading = function (p1, p2) {
        return google.maps.geometry.spherical.computeHeading(p1, p2);
    };

    this.getZoom =  function () {
        return state.map.getZoom();
    };

    this.getParams = function () {
        var center = state.map.getCenter();
        return {'lat': center.lat(), 'lng': center.lng(), 'zoom': state.map.getZoom()};
    };

    this.addLocationControl = function (controlElement) {
        state.map.controls[google.maps.ControlPosition.RIGHT_TOP].push(controlElement);
    };

    this.toggleUiBarControl = function (controlElement) {
        var position = google.maps.ControlPosition.LEFT_BOTTOM;
        if (controlElement === undefined) {
            state.map.controls[position].removeAt(state.control);
            state.control = null;
        } else {
            state.control = state.map.controls[position].push(controlElement) - 1;
        }
    };
}

function MapApiMarker(map, polyline) {
    var that = this;
    var state = getState();

    function getState() {
        var s = {};
        s.latLng = null;
        s.symbolRootElement = null;
        s.isVisible = false;
        s.size = null;
        return s;
    }

    this.init = function (symbolRootElement, isVisible, size) {
        symbolRootElement.style.position = 'absolute';
        state.symbolRootElement = symbolRootElement;
        that.setVisibility(isVisible);
        that.resize(size);
    };

    this.onAdd = function () { // part of OverlayView
        var panes = that.getPanes();
        panes.overlayImage.appendChild(state.symbolRootElement);
    };

    this.draw = function () { // part of OverlayView
        var projection = that.getProjection();
        if ((projection !== undefined) && (projection !== null)) {
            var point = projection.fromLatLngToDivPixel(state.latLng);
            if (point !== null) {
                state.symbolRootElement.style.left = (point.x - state.size / 2) + 'px';
                state.symbolRootElement.style.top = (point.y - state.size / 2) + 'px';
            }
        }
    };

    this.update = function (latLng) {
        state.latLng = latLng;
        var isInViewport = map.getBounds().contains(state.latLng);
        if ((state.isVisible === true) && (isInViewport == true)) {
            if ((that.getMap() === undefined) || (that.getMap() === null)) {
                that.setMap(map);
            }
            if ((polyline.getMap() === undefined) || (polyline.getMap() === null)) {
                polyline.setMap(map);
            }
            that.draw();
        } else {
            that.remove();
            if ((state.isVisible === false) &&
                (polyline.getMap() !== undefined) && (polyline.getMap() !== null)) {
                polyline.setMap(null);
            }
        }
    };

    this.onRemove = function () { // part of OverlayView
        state.symbolRootElement.parentNode.removeChild(state.symbolRootElement);
    };

    this.remove = function () {
        that.setMap(null);
    };

    this.resize = function (newSize) {
        state.size = newSize;
        state.symbolRootElement.style.width = newSize + 'px';
        state.symbolRootElement.style.height = newSize + 'px';
    };

    this.setVisibility = function (newIsVisible) {
        state.isVisible = newIsVisible;
        if (state.latLng !== null) {
            that.update(state.latLng);
        }
    };
}

MapApiMarker.prototype = new google.maps.OverlayView();
