export const playerLevels = [
  { letter: "N", value: 3, label: "National" },
  { letter: "R", value: 2, label: "Régional" },
  { letter: "D", value: 1, label: "Départemental" },
  { letter: "U", value: 0, label: "Non licencié" },
] as const;
export const levelLetter = (value: number) =>
  playerLevels.find((level) => level.value === value)?.letter || "U";
export const levelLegend = playerLevels
  .map((level) => `${level.letter} : ${level.label}`)
  .join(" · ");
