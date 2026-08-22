export interface GeoNamesRawItem {
  geonameId: number;
  name: string;
  asciiName?: string;
  toponymName?: string;
  countryName?: string;
  countryCode?: string;
  adminName1?: string;
  adminCode1?: string;
  lat?: string | number;
  lng?: string | number;
  population?: number;
  timezone?: {
    timeZoneId?: string;
  };
  fcode?: string;
  fcl?: string;
}

export interface GeoNamesSearchResponse {
  totalResultsCount?: number;
  geonames?: GeoNamesRawItem[];
}

export interface CityRecord {
  id?: string;
  geoname_id: number | null;
  name: string;
  ascii_name: string | null;
  country_name: string | null;
  country_code: string | null;
  admin1_name: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  population: number | null;
  created_at?: Date | string;
  updated_at?: Date | string;
}

export interface CityDto {
  geoname_id: number | null;
  name: string;
  ascii_name: string | null;
  country_name: string | null;
  country_code: string | null;
  admin1_name: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string | null;
  population: number | null;
  display_name: string;
}
