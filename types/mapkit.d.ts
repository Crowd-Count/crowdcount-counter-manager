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

  class PointOfInterestFilter {
    static including(categories: PointOfInterestCategory[]): PointOfInterestFilter;
    static excluding(categories: PointOfInterestCategory[]): PointOfInterestFilter;
  }

  type PointOfInterestCategory = string;

  const PointOfInterestCategory: {
    Airport: PointOfInterestCategory;
    AmusementPark: PointOfInterestCategory;
    Aquarium: PointOfInterestCategory;
    ATM: PointOfInterestCategory;
    Bakery: PointOfInterestCategory;
    Bank: PointOfInterestCategory;
    Beach: PointOfInterestCategory;
    Brewery: PointOfInterestCategory;
    Cafe: PointOfInterestCategory;
    Campground: PointOfInterestCategory;
    CarRental: PointOfInterestCategory;
    EVCharger: PointOfInterestCategory;
    FireStation: PointOfInterestCategory;
    FitnessCenter: PointOfInterestCategory;
    FoodMarket: PointOfInterestCategory;
    GasStation: PointOfInterestCategory;
    Hospital: PointOfInterestCategory;
    Hotel: PointOfInterestCategory;
    Laundry: PointOfInterestCategory;
    Library: PointOfInterestCategory;
    Marina: PointOfInterestCategory;
    MovieTheater: PointOfInterestCategory;
    Museum: PointOfInterestCategory;
    NationalPark: PointOfInterestCategory;
    Nightlife: PointOfInterestCategory;
    Park: PointOfInterestCategory;
    Parking: PointOfInterestCategory;
    Pharmacy: PointOfInterestCategory;
    Police: PointOfInterestCategory;
    PostOffice: PointOfInterestCategory;
    PublicTransport: PointOfInterestCategory;
    Restaurant: PointOfInterestCategory;
    Restroom: PointOfInterestCategory;
    School: PointOfInterestCategory;
    Stadium: PointOfInterestCategory;
    Store: PointOfInterestCategory;
    Theater: PointOfInterestCategory;
    University: PointOfInterestCategory;
    Winery: PointOfInterestCategory;
    Zoo: PointOfInterestCategory;
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
    showsPointsOfInterest?: boolean;
    pointOfInterestFilter?: PointOfInterestFilter;
  }
}
