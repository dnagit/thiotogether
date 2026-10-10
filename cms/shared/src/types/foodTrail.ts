/** A food trail — a checklist of restaurants and their dishes — as the admin sees one. */
export interface FoodTrail {
  id: number;
  name: string;
  description: string | null;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  /** How many restaurants it holds. */
  _count?: { places: number };
}

/** One dish. `image` is for the admin's poster and never reaches the website. */
export interface FoodMenu {
  id: number;
  placeId: number;
  name: string;
  image: string | null;
  sortOrder: number;
}

/** One restaurant. `image` is for the admin's poster and never reaches the website. */
export interface FoodPlace {
  id: number;
  trailId: number;
  name: string;
  note: string | null;
  image: string | null;
  sortOrder: number;
  menus: FoodMenu[];
}

/** `GET /food-trails/trails/:id/tree` — a trail with every restaurant and dish, in order. */
export interface FoodTrailTree extends FoodTrail {
  places: FoodPlace[];
}

/**
 * `GET /public/food-trail?trailId=` — what the website's checklist block shows: names only,
 * no pictures. `null` when there is no such trail, or it is hidden.
 */
export interface PublicFoodTrail {
  id: number;
  name: string;
  description: string | null;
  places: Array<{
    id: number;
    name: string;
    note: string | null;
    menus: Array<{ id: number; name: string }>;
  }>;
}
