### React Native

- One shared codebase for iOS and Android
- Shared UI and data-processing logic
- Physical-device testing for platform-specific issues

### MapLibre

- Open-source mobile map library
- Displays our GeoJSON occurrence records

### Zoom-based clustering

- MapLibre's native GeoJSON clustering
- Thresholds for grouping points
  - Maximum distance between points
  - Minimum number of points per cluster

### Expo development build

- Development and build workflow for the React Native app
- MapLibre includes native iOS and Android code
- We use an Expo development build because MapLibre does not run in Expo Go

### GeoJSON

- Standard format for geographic data
- Each occurrence contains coordinates and record details
- Passed directly to MapLibre for map display

### Frozen ALA snapshot

- ALA records collected once using `galah`
- The same records are used throughout the semester
- Snapshot metadata records the source, filters, licence and checksums

### Data loading

- Small fixed sample bundled for a reliable demo
- Complete GeoJSON files stored outside the app
- Selected species data downloaded from a server when needed

### Time filters

- Filter records by year, month or Australian season
- Produce one shared filtered dataset
- Map, count and data panel use the same results

### Testing and validation

- Jest and React Native Testing Library for automated tests
- TypeScript checks data and component types
- Tests cover data loading, filters, clustering and UI states

### MaxEnt

- Optional pre-computed species-distribution model
- Combines occurrence records with environmental predictors
- Shows habitat suitability, not confirmed species presence

### Map attribution

- MapLibre renders an OpenStreetMap-compatible basemap
- Occurrence data comes from ALA under its recorded licence
- Source and attribution remain visible to users
