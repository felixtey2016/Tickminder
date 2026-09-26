export function studentNameKey(name: string) {
  return name.normalize("NFKC").replace(/\s+/g, "").toLocaleLowerCase("en");
}
