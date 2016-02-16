/* Author: Panu Ranta, panu.ranta@iki.fi, http://14142.net/kartalla/about.html */

'use strict';

function UiBar(utils) {
    var that = this;
    var state = getState();

    function getState() {
        var s = {};
        s.lang = null;
        s.tripTypeInfos = null;
        s.alertsInfo = null;
        s.positionType = null;
        return s;
    }

    this.init = function (lang, tripTypeInfos, alertsInfo, onUiBarVisibilityChange, dataSelection,
                          mapSelection, positionType, getUrlParams) {
        state.lang = lang;
        state.tripTypeInfos = tripTypeInfos;
        state.alertsInfo = alertsInfo;
        state.positionType = positionType;

        var uiBarElement = document.getElementById('ui_bar');
        uiBarElement.innerHTML = '';

        var line1Element = createElement('div');
        line1Element.appendChild(createElement('span', 'clock'));
        line1Element.appendChild(createTextElement(' | '));
        line1Element.appendChild(createTripTypeElement());
        line1Element.appendChild(createAlertsElement());
        uiBarElement.appendChild(line1Element);

        var line2Element = createElement('div');
        line2Element.appendChild(createHideElement(onUiBarVisibilityChange));
        line2Element.appendChild(createTextElement(' | '));
        line2Element.appendChild(createLanguageElement(mapSelection.selectedValue));
        line2Element.appendChild(createTextElement(' | '));
        line2Element.appendChild(createJsonDataElement(dataSelection));
        line2Element.appendChild(createTextElement(' | '));
        line2Element.appendChild(createMapSelectionElement(mapSelection));
        line2Element.appendChild(createPositionElement());
        line2Element.appendChild(createTextElement(' | '));
        line2Element.appendChild(createShareElement(getUrlParams, mapSelection.selectedValue));
        line2Element.appendChild(createTextElement(' | '));
        line2Element.appendChild(createAboutLinkElement());
        uiBarElement.appendChild(line2Element);
    };

    this.restart = function () {
        var oldTripTypeElement = document.getElementById('tripType');
        var newTripTypeElement = createTripTypeElement();
        oldTripTypeElement.parentNode.replaceChild(newTripTypeElement, oldTripTypeElement);

        var oldAlertElement = document.getElementById('alerts');
        var newAlertElement = createAlertsElement();
        oldAlertElement.parentNode.replaceChild(newAlertElement, oldAlertElement);

        var oldPositionElement = document.getElementById('positionType');
        var newPositionElement = createPositionElement();
        oldPositionElement.parentNode.replaceChild(newPositionElement, oldPositionElement);
    }

    function createTripTypeElement() {
        var tripTypes = state.tripTypeInfos.getTypes();
        var tripTypeNames = state.tripTypeInfos.getNames();
        var tripTypeElement = createElement('span', 'tripType');

        for (var i = 0; i < tripTypeNames.length; i++) {
            var tripTypeName = tripTypeNames[i];
            var statisticsTitle = getStatisticsTitle(tripTypeName);
            var titleElement = createTextElement(statisticsTitle);
            titleElement.style.color = tripTypes[tripTypeName].color;
            tripTypeElement.appendChild(titleElement);
            tripTypeElement.appendChild(createTextElement(': '));
            var elementId = tripTypeName + 'Count';
            tripTypeElement.appendChild(createElement('span', elementId, '--'));
            tripTypeElement.appendChild(createTextElement(' '));
            var tripTypeVisibilityElement =
                createTripTypeVisibilityElement(tripTypeName, tripTypes[tripTypeName]);
            tripTypeElement.appendChild(tripTypeVisibilityElement);
            if (i < (tripTypeNames.length - 1)) {
                tripTypeElement.appendChild(createTextElement(', '));
            }
        }

        return tripTypeElement;
    }

    function getStatisticsTitle(tripTypeName) {
        if (state.lang === 'fi') {
            return {'bus': 'bussit', 'train': 'junat', 'tram': 'ratikat',
                    'metro': 'metrot', 'ferry': 'lautat',
                    'airplane': 'lentävät'}[tripTypeName];
        } else {
            return {'bus': 'buses', 'train': 'trains', 'tram': 'trams',
                    'metro': 'metros', 'ferry': 'ferries',
                    'airplane': 'airplanes'}[tripTypeName];
        }
    }

    function createTripTypeVisibilityElement(tripTypeName, tripType) {
        var visibilityElement = createElement('span');
        updateTripTypeVisibilityElement(visibilityElement, tripType.isVisible);
        visibilityElement.className = 'button';
        visibilityElement.addEventListener('click', function () {
            state.tripTypeInfos.toggleVisibility(tripTypeName);
            updateTripTypeVisibilityElement(visibilityElement, tripType.isVisible);
        });
        return visibilityElement;
    }

    function updateTripTypeVisibilityElement(visibilityElement, isVisible) {
        var showText = {'en': 'show', 'fi': 'näytä'}[state.lang];
        var hideText = {'en': 'hide', 'fi': 'piilota'}[state.lang];
        visibilityElement.title = {false: showText, true: hideText}[isVisible];
        visibilityElement.textContent = '(' + visibilityElement.title.charAt(0) + ')';
    }

    function createAlertsElement() {
        var alertsElement = createElement('span', 'alerts');
        if (state.alertsInfo.isUsed()) {
            alertsElement.appendChild(createTextElement(' | '));
            alertsElement.appendChild(createTextElement('\u26A0: '));
            alertsElement.appendChild(createAlertCountElement(undefined));
        }
        return alertsElement;
    }

    function createAlertCountElement(alerts) {
        var elementId = 'alertCount';
        if ((alerts === undefined) || (alerts.length === 0)) {
            var countElement = createElement('span', elementId, '0');
            countElement.title =
                {'en': 'no traffic alerts', 'fi': 'ei häiriötiedotteita'}[state.lang];
        } else {
            var countElement = createElement('span', elementId, '(' + alerts.length + ')');
            countElement.title =
                {'en': 'show traffic alerts', 'fi': 'näytä häiriötiedotteet'}[state.lang];
            countElement.className = 'alert button';
            countElement.addEventListener('click', function () {
                var alertListElementId = 'alertList';
                if (document.getElementById(alertListElementId) === null) {
                    createAlertListElement(alertListElementId, alerts);
                }
            });
        }
        return countElement;
    }

    function createAlertListElement(elementId, alerts) {
        var alertListElement = createElement('div', elementId);
        alertListElement.className = 'textBox';
        alertListElement.appendChild(createCloseButtonElement());
        var listElement = createElement('ul', elementId);
        listElement.className = 'alertList';
        for (var i = 0; i < alerts.length; i++) {
            var itemElement = createElement('li', undefined, alerts[i]['text']);
            var alertColor = getAlertColor(alerts[i]['type']);
            if (alertColor !== undefined) {
                itemElement.style.color = alertColor;
            }
            listElement.appendChild(itemElement);
        }
        alertListElement.appendChild(listElement);
        document.body.appendChild(alertListElement);
        centerElement(alertListElement);
    }

    function getAlertColor(alertType) {
        var alertTypes =
            {'BUS': 'bus', 'RAIL': 'train', 'TRAM': 'tram', 'SUBWAY': 'metro', 'FERRY': 'ferry'};

        if (alertTypes[alertType] !== undefined) {
            var tripTypes = state.tripTypeInfos.getTypes();
            return tripTypes[alertTypes[alertType]]['color'];
        } else {
            return undefined;
        }
    }

    function createHideElement(onUiBarVisibilityChange) {
        var hideElement = createTextElement('(\u2199)');
        hideElement.className = 'button';
        hideElement.title = {'en': 'hide control bar', 'fi': 'piilota ohjainpalkki'}[state.lang];
        hideElement.addEventListener('click', function () {
            var showElement = createTextElement('(\u2197)');
            showElement.className = 'button visibilityButton';
            showElement.title = {'en': 'show control bar', 'fi': 'näytä ohjainpalkki'}[state.lang];
            showElement.addEventListener('click', function () {
                document.getElementById('ui_bar').style.visibility = 'visible';
                onUiBarVisibilityChange();
            });
            document.getElementById('ui_bar').style.visibility = 'hidden';
            onUiBarVisibilityChange(showElement);
        });
        return hideElement;
    }

    function createLanguageElement(selectedMap) {
        var languageElement = createElement('span');
        if (state.lang === 'fi') {
            languageElement.appendChild(createTextElement('suomi / '));
            var linkElement = createElement('a', undefined, 'English');
            linkElement.href = getUrl(selectedMap, 'en');
            linkElement.title = 'show English version of this page';
            languageElement.appendChild(linkElement);
        } else {
            var linkElement = createElement('a', undefined, 'suomi');
            linkElement.href = getUrl(selectedMap, 'fi');
            linkElement.title = 'näytä sivun suomenkielinen versio';
            languageElement.appendChild(linkElement);
            languageElement.appendChild(createTextElement(' / English'));
        }
        return languageElement;
    }

    function getUrl(selectedMap, lang) {
        var baseUrl = document.URL.split('/');
        baseUrl.pop();
        baseUrl = baseUrl.join('/');
        var prefix = {'Leaflet': 'index', 'Google': 'gmap'}[selectedMap];
        return baseUrl + '/' + prefix + '.' + lang + '.html';
    }

    function createJsonDataElement(dataSelection) {
        var jsonDataElement = createElement('span');
        jsonDataElement.appendChild(createElement('span', 'dataInfo', 'Data'));
        jsonDataElement.appendChild(createTextElement(': '));
        jsonDataElement.appendChild(createSelectionElement(dataSelection));
        jsonDataElement.appendChild(createElement('span', 'dataDownloadStatus'));
        return jsonDataElement;
    }

    function createMapSelectionElement(mapSelection) {
        var mapSelectionElement = createElement('span');
        var titleName = {'en': 'Map', 'fi': 'Kartta'}[state.lang];
        mapSelectionElement.appendChild(createTextElement(titleName + ': '));
        var selectElement = createSelectionElement(mapSelection);
        mapSelectionElement.appendChild(selectElement);
        return mapSelectionElement;
    }

    function createSelectionElement(selectionData) {
        var selectElement = createElement('select');
        for (var i = 0; i < selectionData.values.length; i++) {
            var optionElement = createElement('option');
            optionElement.text = selectionData.values[i];
            optionElement.selected = (selectionData.values[i] === selectionData.selectedValue);
            selectElement.add(optionElement);
        }
        selectElement.onchange = function (event) {
            selectionData.changeType(event.target.value);
        };
        return selectElement;
    }

    function createPositionElement() {
        var positionElement = createElement('span', 'positionType');
        if (state.positionType.isVpUsed() !== undefined) {
            updatePositionElement(positionElement);
        }
        return positionElement;
    }

    function updatePositionElement(positionElement) {
        var computeLabel = {'en': 'computed', 'fi': 'laskettu'}[state.lang];
        var measureLabel = {'en': 'measured', 'fi': 'mitattu'}[state.lang];

        if (state.positionType.isVpUsed()) {
            var computeElement = createTextElement('(' + computeLabel + ')');
            computeElement.title =
                {'en': 'show computed positions', 'fi': 'näytä laskettu sijainti'}[state.lang];
            var measureElement = createTextElement('/' + measureLabel);
            var buttonElement = computeElement;
        } else {
            var computeElement = createTextElement(computeLabel + '/');
            var measureElement = createTextElement('(' + measureLabel + ')');
            measureElement.title =
                {'en': 'show measured positions', 'fi': 'näytä mitattu sijainti'}[state.lang];
            var buttonElement = measureElement;
        }
        buttonElement.className = 'button';
        buttonElement.addEventListener('click', function () {
            state.positionType.toggleUsage();
            updatePositionElement(positionElement);
        });

        while (positionElement.firstChild !== null) {
            positionElement.removeChild(positionElement.firstChild);
        }
        positionElement.appendChild(createTextElement(' | '));
        positionElement.appendChild(computeElement);
        positionElement.appendChild(measureElement);
    }

    function createShareElement(getUrlParams, selectedMap) {
        var buttonName = {'en': 'share', 'fi': 'jaa'}[state.lang];
        var shareElement = createTextElement('(' + buttonName + ')');
        shareElement.className = 'button';
        shareElement.title =
            {'en': 'create link to this page', 'fi': 'tee linkki tähän näkymään'}[state.lang];
        shareElement.addEventListener('click', function () {
            var elementId = 'editShareLink';
            if (document.getElementById(elementId) === null) {
                createEditShareLinkElement(getUrlParams(), elementId, selectedMap);
            }
        });
        return shareElement;
    }

    function createEditShareLinkElement(urlParams, elementId, selectedMap) {
        var editShareLinkElement = createElement('div', elementId);
        editShareLinkElement.className = 'textBox';
        editShareLinkElement.appendChild(createCloseButtonElement());
        var linkElement = createElement('a');
        var itemElementIdPrefix = 'editShareLinkCheckBox';
        var tableElement =
            createShareLinkTableElement(urlParams, linkElement, itemElementIdPrefix, selectedMap);
        editShareLinkElement.appendChild(tableElement);
        editShareLinkElement.appendChild(linkElement);
        document.body.appendChild(editShareLinkElement);
        updateShareLinkUrl(linkElement, urlParams, itemElementIdPrefix, selectedMap);
        centerElement(editShareLinkElement);
    }

    function createCloseButtonElement() {
        var closeElement = createTextElement('(X)');
        closeElement.className = 'closeButton button';
        closeElement.title = {'en': 'close', 'fi': 'sulje'}[state.lang];
        closeElement.addEventListener('click', function () {
            document.body.removeChild(closeElement.parentNode);
        });
        return closeElement;
    }

    function createShareLinkTableElement(urlParams, linkElement, itemElementIdPrefix, selectedMap) {
        var tableElement = createElement('table');
        for (var i = 0; i < urlParams.length; i++) {
            var row = tableElement.insertRow(-1);
            var checkBoxElement =
                createElement('input', itemElementIdPrefix + urlParams[i]['name']);
            checkBoxElement.type = 'checkbox';
            checkBoxElement.checked = urlParams[i]['on'];
            checkBoxElement.addEventListener('click', function () {
                updateShareLinkUrl(linkElement, urlParams, itemElementIdPrefix, selectedMap);
            });
            row.appendChild(checkBoxElement);
            row.appendChild(createElement('td', undefined, urlParams[i]['name']));
            row.appendChild(createElement('td', undefined, urlParams[i]['value']));
        }
        return tableElement;
    }

    function updateShareLinkUrl(linkElement, urlParams, itemElementIdPrefix, selectedMap) {
        var pairs = [];
        for (var i = 0; i < urlParams.length; i++) {
            var elementId = itemElementIdPrefix + urlParams[i]['name'];
            var checkBoxElement = document.getElementById(elementId);
            if (checkBoxElement.checked) {
                pairs.push(urlParams[i]['name'] + '=' + urlParams[i]['value']);
            }
        }
        var fullUrl = getUrl(selectedMap, state.lang) + '?' + pairs.join('&');
        linkElement.href = fullUrl;
        linkElement.textContent = fullUrl;
    }

    function centerElement(elem) {
        elem.style.top = ((document.body.clientHeight - elem.clientHeight) / 2) + 'px';
        elem.style.left = ((document.body.clientWidth - elem.clientWidth) / 2) + 'px';
    }

    function createAboutLinkElement() {
        var linkName = {'en': 'about', 'fi': 'tietoja'}[state.lang];
        var aboutLinkElement = createElement('a', undefined, linkName);
        aboutLinkElement.href = linkName + '.html';
        return aboutLinkElement;
    }

    function createElement(elementType, elementId, textContent) {
        var newElement = document.createElement(elementType);
        if (elementId !== undefined) {
            newElement.id = elementId;
        }
        if (textContent !== undefined) {
            newElement.textContent = textContent;
        }
        return newElement;
    }

    function createTextElement(textContent) {
        return createElement('span', undefined, textContent);
    }

    function setElementText(elementId, textContent) {
        document.getElementById(elementId).textContent = textContent;
    }

    this.updateDownloadProgress = function (progressEvent) {
        var loaded = getMegaBytes(progressEvent.loaded);
        var statusText = {'en': 'downloaded (megabytes)', 'fi': 'ladattu (megatavua)'}[state.lang];
        setElementText('dataDownloadStatus', ' ' + statusText + ' ' + loaded + '...');
    };

    function getMegaBytes(bytes) {
        return ((bytes / 1024) / 1024).toFixed(1);
    }

    this.setDataInfo = function (dtfsEpoch, jsonEpoch, sizeBytes, downloadDuration, isCompressed,
                                 getMqttDataCount) {
        setElementText('dataDownloadStatus', '');
        var infoElement = document.getElementById('dataInfo');
        infoElement.className = 'dataInfo';
        var tooltipElement = createElement('div');
        tooltipElement.className = 'dataInfoToolTip';
        document.body.appendChild(tooltipElement);
        infoElement.addEventListener('mouseover', function () {
            tooltipElement.textContent = getDataInfoTitle({
                'gtfsDate': epochToString(dtfsEpoch, false),
                'jsonDate': epochToString(jsonEpoch, true), 'size': getMegaBytes(sizeBytes),
                'duration': downloadDuration, 'compressed': isCompressed,
                'mqtt': formatMqttDataCount(getMqttDataCount())
            });
            tooltipElement.style.visibility = 'visible';
            utils.setDomTooltipPosition(tooltipElement, infoElement.getBoundingClientRect());
        });
        infoElement.addEventListener('mouseout', function () {
            tooltipElement.style.visibility = 'hidden';
        });
    };

    function epochToString(epoch, isTimeIncluded) {
        return utils.dateToString(new Date(epoch * 1000), isTimeIncluded);
    }

    function formatMqttDataCount(dataCount) {
        if (dataCount === undefined) {
            return undefined;
        } else {
            return getMegaBytes(dataCount);
        }
    }

    function getDataInfoTitle(dataInfo) {
        var titleItems = ['gtfsDate', 'jsonDate', 'size', 'duration', 'compressed', 'mqtt'];
        var dataInfoTitle = '';
        for (var i = 0; i < titleItems.length; i++) {
            var itemValue = getDataInfoItemValue(dataInfo[titleItems[i]]);
            if (itemValue !== undefined) {
                dataInfoTitle += getDataInfoItemName(titleItems[i]) + ': ' + itemValue;
                if (i < (titleItems.length - 1)) {
                    dataInfoTitle += '\n';
                }
            }
        }
        return dataInfoTitle;
    }

    function getDataInfoItemName(dataInfoItem) {
        if (state.lang === 'fi') {
            return {'gtfsDate': 'GTFS', 'jsonDate': 'JSON', 'size': 'Koko (megatavua)',
                    'duration': 'Lataus (sekuntia)', 'compressed': 'Lataus (pakattu)',
                    'mqtt': 'MQTT (megatavua)'}[dataInfoItem];
        } else {
            return {'gtfsDate': 'GTFS', 'jsonDate': 'JSON', 'size': 'Size (megabytes)',
                    'duration': 'Download (seconds)', 'compressed': 'Download (compressed)',
                    'mqtt': 'MQTT (megabytes)'}[dataInfoItem];
        }
    }

    function getDataInfoItemValue(dataInfoItemValue) {
        if ((dataInfoItemValue === true) || (dataInfoItemValue === false)) {
            if (state.lang === 'fi') {
                return {true: 'kyllä', false: 'ei'}[dataInfoItemValue];
            } else {
                return {true: 'yes', false: 'no'}[dataInfoItemValue];
            }
        } else {
            return dataInfoItemValue;
        }
    }

    this.updateClock = function (date) {
        setElementText('clock', utils.dateToString(date, true));
    };

    this.updateStatistics = function () {
        var tripTypes = state.tripTypeInfos.getTypes();
        for (var tripTypeName in tripTypes) {
            if (tripTypes[tripTypeName].isUsed) {
                var elementId = tripTypeName + 'Count';
                setElementText(elementId, tripTypes[tripTypeName].count);
            }
        }
    };

    this.updateAlerts = function (alerts) {
        var oldAlertCountElement = document.getElementById('alertCount');
        var newAlertCountElement = createAlertCountElement(alerts);
        oldAlertCountElement.parentNode.replaceChild(newAlertCountElement, oldAlertCountElement);
    };
}
