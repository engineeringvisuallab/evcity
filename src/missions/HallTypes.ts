// PRESENTATION HALL: the topics the player can present. All text English (other languages are added later as separate topic files).

export interface HallSlide {
  title: string;
  icon: string;
  /** Short keywords shown on the screen behind the stage. */
  bullets: string[];
  /** What the presenter reads aloud: a multiple of 3 lines (3 lines = one page). */
  script: string[];
}

export interface HallTopic {
  id: string;
  title: string;
  icon: string;
  blurb: string;
  slides: HallSlide[];
}

/** A topic that is announced but not written yet. */
export interface HallSoonTopic {
  id: string;
  title: string;
  icon: string;
}

export interface HallPage {
  slide: number;
  lines: string[];
}
