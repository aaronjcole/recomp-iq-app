import { Droplet, BookOpen, Brain, Dumbbell, Heart, Footprints, Coffee, Sun, Moon, Target } from "lucide-react";

export const ICON_MAP = {
  Droplet,
  BookOpen,
  Brain,
  Dumbbell,
  Heart,
  Footprints,
  Coffee,
  Sun,
  Moon,
  Target
};

export const ICON_KEYS = Object.keys(ICON_MAP);

export function iconFor(name) {
  return ICON_MAP[name] || Target;
}