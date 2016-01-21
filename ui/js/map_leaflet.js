/* Author: Panu Ranta, panu.ranta@iki.fi, http://14142.net/kartalla/about.html */

/* Show markers on Leaflet
API Reference: http://leafletjs.com/reference.html
*/

'use strict';

function Map() {
    var that = this;
    var state = getState();

    function getState() {
        var s = {};
        s.gm = null;
        s.polylineCache = {};
        s.markers = {};
        s.symbolBaseSize = 15;
        s.nextMarkerId = 0;
        s.previousSymbolScale = null;
        return s;
    }

    this.init = function (lat, lng, zoomLevel) {
        var baseMaps = getBaseMaps();

        state.gm = L.map('map_canvas', {
            center: [lat, lng],
            zoom: zoomLevel,
            layers: [baseMaps.Mapbox]
        });
        state.gm.on('zoomend', zoomChanged);

        L.control.layers(baseMaps).addTo(state.gm);

        state.previousSymbolScale = getSymbolScale();
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

    function getSymbolScale() {
        var zoom = state.gm.getZoom();
        if (zoom < 12) {
            return 1;
        } else if (zoom < 14) {
            return 2;
        } else if (zoom < 15) {
            return 3;
        } else {
            return 4;
        }
    }

    function zoomChanged() {
        var newScale = getSymbolScale();
        if (newScale !== state.previousSymbolScale) {
            updateSymbolScales(newScale);
        }
        state.previousSymbolScale = newScale;
    }

    function updateSymbolScales(newScale) {
        for (var markerId in state.markers) {
            var marker = state.markers[markerId];
            marker.gmMarker.resize(newScale * state.symbolBaseSize);
        }
    }

    this.restart = function (lat, lng, zoomLevel) {
        state.gm.setView([lat, lng], zoomLevel);
    }

    this.resize = function (newHeight) {
        state.gm.getContainer().style.height = newHeight + 'px';
        state.gm.invalidateSize();
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

    this.addMarker = function (path, pathId, isVisible, color) {
        var marker = createMarker(pathId);
        var symbolElement = createMarkerSymbolElement(isVisible, color, marker);

        if (state.polylineCache[pathId] === undefined) {
            var newPolyline = L.polyline(path, {
                clickable: false, // https://github.com/panur/kartalla/issues/8
                color: 'black',
                opacity: 0.6,
                weight: 1
            });
            state.polylineCache[pathId] = {polyline: newPolyline, count: 1};
        } else {
            state.polylineCache[pathId].count += 1;
        }

        marker.gmPolyline = state.polylineCache[pathId].polyline;

        marker.gmMarker = new SymbolMarker(state.gm, marker.gmPolyline);
        marker.gmMarker.init(createSymbolRootElement(symbolElement), isVisible,
                             getSymbolScale() * state.symbolBaseSize);

        marker.gmSymbol = {
            element: symbolElement,
            form: ''
        };

        return marker;
    };

    function createMarker(pathId) {
        var marker = {
            gmMarker: null, gmSymbol: null, gmPolyline: null, pathId: pathId,
            markerId: state.nextMarkerId, title: '',
            angle: 0  // 0-360, 0=north, 90=east, 180=south, 270=west
        };
        state.markers[state.nextMarkerId] = marker;
        state.nextMarkerId += 1;
        return marker;
    }

    function createMarkerSymbolElement(isVisible, color, marker) {
        var symbolElement = createSvgElement('g');
        symbolElement.style.visibility = getVisibilityString(isVisible);
        symbolElement.style.fill = color;
        symbolElement.addEventListener('mouseover', function () {
            updateSymbolTooltipElement(symbolElement, marker);
        });
        symbolElement.addEventListener('mouseout', function () {
            hideSymbolTooltipElement(symbolElement);

        });
        return symbolElement;
    }

    function getSymbolTooltipElement() {
        var elementId = 'markerSymbolTooltip';
        var symbolTooltipElement = document.getElementById(elementId);
        if (symbolTooltipElement === null) {
            symbolTooltipElement = createSymbolTooltipElement(elementId);
            document.body.appendChild(symbolTooltipElement);
        }
        return symbolTooltipElement;
    }

    function createSymbolTooltipElement(elementId) {
        var symbolTooltipElement = document.createElement('div');
        symbolTooltipElement.id = elementId;
        symbolTooltipElement.style.position = 'absolute';
        symbolTooltipElement.style.padding = '5px';
        symbolTooltipElement.style.whiteSpace = 'pre';
        symbolTooltipElement.style.background = 'linear-gradient(to bottom, khaki, white)';
        return symbolTooltipElement;
    }

    function updateSymbolTooltipElement(symbolElement, marker) {
        var rect = symbolElement.getBoundingClientRect();
        symbolElement.style.cursor = 'help';
        showSymbolTooltipElement(rect, marker.title);
    }

    function showSymbolTooltipElement(rect, title) {
        var symbolTooltipElement = getSymbolTooltipElement();
        symbolTooltipElement.textContent = title;
        symbolTooltipElement.style.visibility = 'visible';

        var leftOffset = {true: 0,
            false: symbolTooltipElement.offsetWidth}[rect.left < (window.innerWidth / 2)];
        symbolTooltipElement.style.left = (rect.left - leftOffset) + 'px';
        var topOffset = {true: -rect.height,
            false: symbolTooltipElement.offsetHeight}[rect.top < (window.innerHeight / 2)];
        symbolTooltipElement.style.top = (rect.top - topOffset) + 'px';
    }

    function hideSymbolTooltipElement(symbolElement) {
        var symbolTooltipElement = getSymbolTooltipElement();
        symbolTooltipElement.style.visibility = 'hidden';
        symbolElement.style.cursor = '';
    }

    function getVisibilityString(isVisible) {
        return {true: 'visible', false: 'hidden'}[isVisible];
    }

    function createSymbolRootElement(svgSymbolElement) {
        var wrapperElement = document.createElement('div');
        var svgRootElement = createSvgElement('svg');
        svgRootElement.setAttribute('viewBox', '0 0 10 10');
        svgRootElement.appendChild(svgSymbolElement);
        wrapperElement.appendChild(svgRootElement);
        return wrapperElement;
    }

    function createSvgElement(elementType) {
        return document.createElementNS('http://www.w3.org/2000/svg', elementType);
    }

    this.updateMarker = function (marker, distanceFromStart, opacity, title) {
        var distance = getPathPositionAndHeading(marker.gmPolyline.getLatLngs(), distanceFromStart);

        var symbolForm = getSymbolForm(distanceFromStart, opacity);
        if (symbolForm !== marker.gmSymbol.form) {
            marker.gmSymbol.form = symbolForm;
            updateSymbol(marker.gmSymbol);
        }
        marker.gmSymbol.element.style.opacity = opacity;
        marker.gmSymbol.element.setAttribute('transform',
                                             'rotate(' + (distance.heading - 90) + ', 5, 5)');

        marker.title = title;
        marker.angle = distance.heading;

        marker.gmMarker.update(distance.position);
    };

    function getPathPositionAndHeading(path, distanceFromStart) {
        var cumulDistance = 0;

        for (var i = 1; i < path.length; i++) {
            var p1 = path[i - 1];
            var p2 = path[i];
            var distanceInc = p1.distanceTo(p2);
            cumulDistance += distanceInc;
            if (cumulDistance > distanceFromStart) {
                var distanceFromP1 = (distanceFromStart - (cumulDistance - distanceInc));
                var fraction = distanceFromP1 / distanceInc;
                var position = interpolate(p1, p2, fraction);
                var heading = computeHeading(p1, p2);
                return {position: position, heading: heading};
            }
        }

        var p1 = path[path.length - 2];
        var p2 = path[path.length - 1];
        return {position: p2, heading: computeHeading(p1, p2)};
    }

    // based on http://www.movable-type.co.uk/scripts/latlong.html
    function interpolate(p1, p2, fraction) {
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
    }

    // based on http://www.movable-type.co.uk/scripts/latlong.html
    function computeHeading(p1, p2) {
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
    }

    function getSymbolForm(distanceFromStart, opacity) {
        if (distanceFromStart === 0) {
            return 'square';
        } else {
            if (opacity < 1) {
                return 'circle';
            } else {
                return 'arrow';
            }
        }
    }

    function updateSymbol(gmSymbol) {
        if (gmSymbol.form === 'square') {
            var svgElement = createSvgElement('rect');
            svgElement.setAttribute('x', '2');
            svgElement.setAttribute('y', '2');
            svgElement.setAttribute('width', '6');
            svgElement.setAttribute('height', '6');
        } else if (gmSymbol.form === 'circle') {
            var svgElement = createSvgElement('circle');
            svgElement.setAttribute('cx', '5');
            svgElement.setAttribute('cy', '5');
            svgElement.setAttribute('r', '3');
        } else { // arrow ->
            var svgElement = createSvgElement('path');
            svgElement.setAttribute('d', 'M 2,2 8,5 2,8 4,5 z');
        }

        if (gmSymbol.element.firstChild !== null) {
            gmSymbol.element.removeChild(gmSymbol.element.firstChild);
        }
        gmSymbol.element.appendChild(svgElement);
    }

    this.removeMarker = function (marker) {
        marker.gmMarker.remove();
        marker.gmMarker = null;
        delete state.markers[marker.markerId];

        state.polylineCache[marker.pathId].count -= 1;
        if (state.polylineCache[marker.pathId].count === 0) {
            state.gm.removeLayer(marker.gmPolyline);
            marker.gmPolyline = null;
            delete state.polylineCache[marker.pathId];
        }
    };

    this.setMarkerVisibility = function (marker, isVisible) {
        marker.gmSymbol.element.style.visibility = getVisibilityString(isVisible);
        marker.gmMarker.setVisibility(isVisible);
    };

    this.getDistances = function (path, pathIndexes) {
        var distances = [0];
        var distanceFromStart = 0;

        for (var i = 1, j = 1; i < path.length; i++) {
            var p1 = path[i - 1];
            var p2 = path[i];
            var distanceInc = p1.distanceTo(p2);
            distanceFromStart += distanceInc;
            if (i === pathIndexes[j]) {
                j += 1;
                distances.push(Math.round(distanceFromStart));
            }
        }

        return distances;
    };

    this.getParams = function () {
        var center = state.gm.getCenter();
        return {'lat': center.lat, 'lng': center.lng, 'zoom': state.gm.getZoom()};
    };
}

function SymbolMarker(nativeMap, nativePolyline) {
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
        state.nativeMarker = L.marker(nativeMap.getCenter(), {
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
            state.nativeMarker.addTo(nativeMap);
        }

        if ((state.isPolylineOnMap === false) && (state.isVisible === true)) {
            state.isPolylineOnMap = true;
            nativePolyline.addTo(nativeMap);
        }
    };

    this.remove = function() {
        nativeMap.removeLayer(state.nativeMarker);
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
                nativePolyline.addTo(nativeMap);
            }
        } else {
            if (state.isPolylineOnMap === true) {
                state.isPolylineOnMap = false;
                nativeMap.removeLayer(nativePolyline);
            }
        }
    };
}
