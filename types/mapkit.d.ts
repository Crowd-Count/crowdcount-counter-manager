declare namespace mapkit {
  function init(options: { authorizationCallback: (done: (token: string) => void) => void }): void;

  class Map {
    constructor(container: HTMLElement, options?: MapConstructorOptions);
    colorScheme: string;
    destroy(): void;
  }

  class Coordinate {
    constructor(latitude: number, longitude: number);
  }

  class CoordinateRegion {
    constructor(center: Coordinate, span: CoordinateSpan);
  }

  class CoordinateSpan {
    constructor(latitudeDelta: number, longitudeDelta: number);
  }

  const ColorScheme: {
    Light: string;
    Dark: string;
  };

  const MapType: {
    Standard: string;
    MutedStandard: string;
    Satellite: string;
    Hybrid: string;
  };

  interface MapConstructorOptions {
    center?: Coordinate;
    region?: CoordinateRegion;
    mapType?: string;
    colorScheme?: string;
    isScrollEnabled?: boolean;
    isZoomEnabled?: boolean;
    isRotationEnabled?: boolean;
    showsCompass?: string;
    showsMapTypeControl?: boolean;
    showsZoomControl?: boolean;
    showsScale?: string;
  }
}
