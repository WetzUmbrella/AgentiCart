// Sample box labels for the demo, made by the team (public/demo-labels/). Safe to import in the browser.
// In live mode Gemini reads the image like any photo. Mock mode cannot read images, so it uses
// `label_text` from this list instead, and only when the merchant picked one of these samples.

export type SampleLabel = {
  id: string;
  /** Text printed on the label; also what mock mode "reads". Empty means unreadable. */
  label_text: string;
  /** What the merchant declares when this sample is picked (they can edit it). */
  declared: string;
  caption: string;
};

export const SAMPLE_LABELS: SampleLabel[] = [
  { id: "scarlett-2i2-4", label_text: "Focusrite Scarlett 2i2 4th Gen", declared: "Scarlett 2i2 4th Gen", caption: "Scarlett 2i2 4th Gen" },
  { id: "sm58-lc", label_text: "Shure SM58-LC", declared: "SM58-LC", caption: "SM58-LC (verified variant)" },
  { id: "sm58s", label_text: "Shure SM58S", declared: "SM58S", caption: "SM58S (switch variant)" },
  { id: "hmic-010", label_text: "Hosa HMIC-010", declared: "HMIC-010", caption: "Hosa HMIC-010" },
  { id: "psa1", label_text: "RODE PSA1", declared: "PSA1", caption: "RODE PSA1" },
  { id: "mdr-7506", label_text: "Sony MDR-7506", declared: "MDR-7506", caption: "Sony MDR-7506" },
  { id: "unreadable", label_text: "", declared: "SM58-LC", caption: "Blurry label" },
];

export const sampleLabelUrl = (id: string) => `/demo-labels/${id}.png`;

export function getSampleLabel(id: unknown): SampleLabel | undefined {
  return SAMPLE_LABELS.find((s) => s.id === id);
}
