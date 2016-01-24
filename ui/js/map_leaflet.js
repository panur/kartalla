/* Author: Panu Ranta, panu.ranta@iki.fi, http://14142.net/kartalla/about.html */

/* Show markers on Leaflet
API Reference: http://leafletjs.com/reference.html
*/

'use strict';

function MapApiMap() {
    var that = this;
    var state = getState();

    function getState() {
        var s = {};
        s.map = null;
        s.control = null;
        return s;
    }

    this.init = function (lat, lng, zoomLevel, zoomChanged) {
        var baseMaps = getBaseMaps();

        state.map = L.map('map_canvas', {
            center: [lat, lng],
            zoom: zoomLevel,
            layers: [baseMaps.Mapbox]
        });
        state.map.on('zoomend', zoomChanged);

        L.control.layers(baseMaps).addTo(state.map);
    };

    function getBaseMaps() {
        var url = 'https://api.tiles.mapbox.com/v4/{id}/{z}/{x}/{y}.png?access_token={accessToken}';
        var mapbox = L.tileLayer(url, {
            attribution: 'Map data &copy; <a href="http://openstreetmap.org">OpenStreetMap</a> ' +
                'contributors, ' +
                '<a href="http://creativecommons.org/licenses/by-sa/2.0/">CC-BY-SA</a>, ' +
                'Imagery &copy; <a href="http://mapbox.com">Mapbox</a>',
            maxZoom: 18,
            id: 'mapbox.streets',
            accessToken: 'pk.eyJ1IjoicGFudXIiLCJhIjoiY2lqMzZnZWJuMDAz' +
                'eXR0a25jYm84Y2M4ZCJ9.0JDpHBxZNybehgLgGBAO9g'
        });
        var osm = L.tileLayer('http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        });
        var hsl = L.tileLayer('http://digitransit.fi/hsl-map/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: 'Map data &copy; ' +
                '<a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>, ' +
                'Tiles &copy; <a href="http://digitransit.fi/">Digitransit</a>'
        });
        return {'Mapbox': mapbox, 'OpenStreetMap': osm, 'HSL': hsl};
    }

    this.getMap = function () {
        return state.map;
    };

    this.restart = function (lat, lng, zoomLevel) {
        state.map.setView([lat, lng], zoomLevel);
    };

    this.resize = function (newHeight) {
        state.map.getContainer().style.height = newHeight + 'px';
        state.map.invalidateSize();
    };

    this.decodePath = function (encodedPath) {
        return decodeLine(encodedPath);
    };

    // http://code.google.com/apis/maps/documentation/utilities/include/polyline.js
    // Decode an encoded polyline into a list of latLng.
    function decodeLine(encoded) {
        var len = encoded.length;
        var index = 0;
        var array = [];
        var lat = 0;
        var lng = 0;

        while (index < len) {
            var b;
            var shift = 0;
            var result = 0;
            do {
                b = encoded.charCodeAt(index++) - 63;
                result |= (b & 0x1f) << shift;
                shift += 5;
            } while (b >= 0x20);
            var dlat = ((result & 1) ? ~(result >> 1) : (result >> 1));
            lat += dlat;

            shift = 0;
            result = 0;
            do {
                b = encoded.charCodeAt(index++) - 63;
                result |= (b & 0x1f) << shift;
                shift += 5;
            } while (b >= 0x20);
            var dlng = ((result & 1) ? ~(result >> 1) : (result >> 1));
            lng += dlng;

            array.push(L.latLng(lat * 1e-5, lng * 1e-5));
        }

        return array;
    }

    // path as returned by decodePath()
    this.newPolyline = function (path, polylineOptions) {
        var polyline = L.polyline(path, {
            clickable: false, // https://github.com/panur/kartalla/issues/8
            color: polylineOptions.color,
            opacity: polylineOptions.opacity,
            weight: polylineOptions.weight
        });
        return polyline;
    };

    this.getPolylinePath = function (polyline) {
        return polyline.getLatLngs();
    };

    this.removePolyline = function (polyline) {
        state.map.removeLayer(polyline);
    };

    // polylinePath as returned by getPolylinePath()
    this.getPathLength = function (polylinePath) {
        return polylinePath.length;
    };

    // polylinePath as returned by getPolylinePath()
    this.getPathPoint = function (polylinePath, index) {
        return polylinePath[index];
    };

    this.computeDistance = function(p1, p2) {
        return p1.distanceTo(p2);
    };

    // based on http://www.movable-type.co.uk/scripts/latlong.html
    this.interpolate = function(p1, p2, fraction) {
        var radius = 6378137; // earth's radius in meters
        var d = p1.distanceTo(p2) / radius;
        var lat1 = p1.lat * L.LatLng.DEG_TO_RAD;
        var lon1 = p1.lng * L.LatLng.DEG_TO_RAD;
        var lat2 = p2.lat * L.LatLng.DEG_TO_RAD;
        var lon2 = p2.lng * L.LatLng.DEG_TO_RAD;
        var A = Math.sin((1 - fraction) * d) / Math.sin(d);
        var B = Math.sin(fraction * d) / Math.sin(d);
        var x = ((A * Math.cos(lat1)) * Math.cos(lon1)) + ((B * Math.cos(lat2)) * Math.cos(lon2));
        var y = ((A * Math.cos(lat1)) * Math.sin(lon1)) + ((B * Math.cos(lat2)) * Math.sin(lon2));
        var z =  (A * Math.sin(lat1))                   +  (B * Math.sin(lat2));
        var lat = Math.atan2(z, Math.sqrt(Math.pow(x, 2) + Math.pow(y, 2)));
        var lon = Math.atan2(y, x);
        return L.latLng(lat * L.LatLng.RAD_TO_DEG, lon * L.LatLng.RAD_TO_DEG);
    };

    // based on http://www.movable-type.co.uk/scripts/latlong.html
    this.computeHeading = function (p1, p2) {
        var lat1 = p1.lat * L.LatLng.DEG_TO_RAD;
        var lon1 = p1.lng * L.LatLng.DEG_TO_RAD;
        var lat2 = p2.lat * L.LatLng.DEG_TO_RAD;
        var lon2 = p2.lng * L.LatLng.DEG_TO_RAD;

        var y = Math.sin(lon1 - lon2) * Math.cos(lat2);
        var x = (Math.cos(lat1) * Math.sin(lat2)) -
            (Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon1 - lon2));
        var angle = - Math.atan2(y, x);

        if (angle < 0.0) {
            angle += Math.PI * 2.0;
        }

        return angle * L.LatLng.RAD_TO_DEG;
    };

    this.getZoom =  function () {
        return state.map.getZoom();
    };

    this.getParams = function () {
        var center = state.map.getCenter();
        return {'lat': center.lat, 'lng': center.lng, 'zoom': state.map.getZoom()};
    };

    this.toggleControl = function (controlElement) {
        if (controlElement === undefined) {
            state.map.removeControl(state.control);
            state.control = null;
        } else {
            var CustomControl = L.Control.extend({
                options: {
                    position: 'bottomleft'
                },
                onAdd: function (map) {
                    return controlElement;
                }
            });
            state.control = new CustomControl();
            state.map.addControl(state.control);
        }
    };
}

function MapApiMarker(map, polyline) {
    var that = this;
    var state = getState();

    function getState() {
        var s = {};
        s.isVisible = false;
        s.isMarkerOnMap = false;
        s.isPolylineOnMap = false;
        s.nativeMarker = null;
        return s;
    }

    this.init = function (symbolRootElement, isVisible, size) {
        state.nativeMarker = L.marker(map.getCenter(), {
            clickable: false, // https://github.com/panur/kartalla/issues/8
            icon: createIcon(symbolRootElement)
        });

        that.setVisibility(isVisible);
        that.resize(size);
    };

    function createIcon(symbolRootElement) {
        var iconOptions = {domElement: symbolRootElement, className: ''};
        return new DomIcon(iconOptions);
    }

    function setIconSize(iconOptions, newSymbolSize) {
        iconOptions.iconSize = new L.Point(newSymbolSize, newSymbolSize);
    }

    var DomIcon = L.DivIcon.extend({
        options: {
            domElement: null
        },

        createIcon: function(oldIcon) {
            var div = (oldIcon && (oldIcon.tagName === 'DIV')) ? oldIcon : this.options.domElement;
            this._setIconStyles(div, 'icon');
            return div;
        }
    });

    this.update = function(latLng) {
        state.nativeMarker.setLatLng(latLng);
        state.nativeMarker.update();

        if (state.isMarkerOnMap === false) {
            state.isMarkerOnMap = true;
            state.nativeMarker.addTo(map);
        }

        if ((state.isPolylineOnMap === false) && (state.isVisible === true)) {
            state.isPolylineOnMap = true;
            polyline.addTo(map);
        }
    };

    this.remove = function() {
        map.removeLayer(state.nativeMarker);
    };

    this.resize = function(newSize) {
        var icon = state.nativeMarker.options.icon;
        setIconSize(icon.options, newSize);
        state.nativeMarker.setIcon(icon);
    };

    this.setVisibility = function (newIsVisible) {
        state.isVisible = newIsVisible;
        if (state.isVisible === true) {
            if (state.isPolylineOnMap === false) {
                state.isPolylineOnMap = true;
                polyline.addTo(map);
            }
        } else {
            if (state.isPolylineOnMap === true) {
                state.isPolylineOnMap = false;
                map.removeLayer(polyline);
            }
        }
    };
}
