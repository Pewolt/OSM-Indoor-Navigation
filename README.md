# 3D Indoor Routing ("S-Bahnhof Friedrichstraße")

[![Hier Testen](https://img.shields.io/badge/Hier_Testen-red)](https://osmindoor.peterwolters.org/)

Ein interaktives 3D-Indoor-Navigationssystem basierend auf OpenStreetMap-Daten, entwickelt mit Three.js.

## 🌟 Features

### 🗺️ 3D-Visualisierung
- **Realistisches Rendering**: Darstellung von Bahnhofsebenen, Bahnsteigen und Räumen.
- **Interaktive Features**:
    - **Stockwerk-Explosion**: Ein Slider ermöglicht das vertikale Auseinanderziehen der Etagen zur besseren Übersicht.
    - **Treppen & Rolltreppen**: 
        - Detaillierte Stufenmodelle für Treppen.
        - Animierte Rolltreppen mit Richtungsanzeige (Grün/Rot) basierend auf OSM-Daten (`conveying`).
    - **Verbindungen**: Visualisierung von Aufzügen und Wegen.

### 📍 Navigation & Routing
- **Dijkstra-Algorithmus**: Kürzeste-Pfad-Suche zwischen zwei Punkten.
- **Interaktive Wegwahl**:
    - Start- und Zielpunkt per Klick auf die Karte wählbar.
    - **Start fixieren**: Ermöglicht das Ändern des Ziels bei gleichbleibendem Startpunkt.
- **Replay-Modus**: Schrittweises Abspielen der Route zur besseren Orientierung.
- **Multimodales Routing**: Berücksichtigt Treppen, Aufzüge und Ebenenwechsel.

### 🔍 Suche & UI
- **Ortssuche**: Finden von Gleisen und POIs über ein Suchfeld.
- **Status-Feedback**: Klare Rückmeldungen über Routing-Status und Distanz.
- **Werkzeuge**: Buttons zum Löschen der Route und Fixieren von Punkten.

## 🛠️ Technologie-Stack

- **Frontend**: HTML5, CSS3, Vanilla JavaScript (ES6+)
- **3D-Engine**: [Three.js](https://threejs.org/)
- **Datenbasis**: OpenStreetMap (OSM) JSON Export
- **Algorithmen**: Eigener Graph-Builder und Dijkstra-Implementierung.

## 🚀 Installation & Nutzung

1. **Repository klonen** oder herunterladen.
2. **Lokalen Server starten**:
   Da Three.js und Module verwendet werden, muss die Anwendung über einen Webserver laufen (wegen CORS-Richtlinien).
   ```bash
   # Beispiel mit Python
   python -m http.server 8080
   ```
   Oder `Live Server` in VS Code nutzen.
3. **Browser öffnen**: `http://localhost:8080/index.html` aufrufen.

## 🎮 Steuerung

- **Linke Maustaste**: Drehen der Kamera / Klicken auf Nodes.
- **Rechte Maustaste**: Verschieben der Kamera (Pan).
- **Mausrad**: Zoomen.
- **Slider**: Steuert die "Explosion" der Stockwerke.

## 📂 Projektstruktur

- `index.html`: Hauptentrypoint und UI-Struktur.
- `js/`
  - `main.js`: Initialisierung der 3D-Szene und Render-Loop.
  - `data.js`: Parsen der OSM-Daten und Konvertierung in 3D-Objekte.
  - `geometry.js`: Erstellung der 3D-Meshes (Räume, Treppen, Rolltreppen).
  - `graph.js`: Routing-Logik (Graph-Erstellung, Dijkstra).
  - `interaction.js`: Event-Handling (Klicks, Hover, Replay).
  - `ui.js`: DOM-Manipulation und UI-Updates.
  - `config.js`: Zentrale Konfiguration (Farben, Größen).

---
*Projekt im Rahmen des Moduls GeoIT 2025/26.*
