declare namespace mapkit {
  function init(options: { authorizationCallback: (done: (token: string) => void) => void }): void;

  class Map {
    constructor(container: HTMLElement, options?: MapConstructorOptions);
    colorScheme: string;
    destroy(): void;

    static readonly MapTypes: {
      Standard: string;
      MutedStandard: string;
      Satellite: string;
      Hybrid: string;
    };

    static readonly ColorSchemes: {
      Light: string;
      Dark: string;
    };
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

  const FeatureVisibility: {
    Hidden: string;
    Visible: string;
    Adaptive: string;
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
