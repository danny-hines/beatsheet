import { describe, expect, it } from "vitest";
import { latinFaces } from "../src/fonts.ts";

// The shape of a Google Fonts css2 response (one family, two weights of a variable font, and other subsets).
const SHEET = `/* latin-ext */
@font-face {
  font-family: 'Fraunces';
  font-style: normal;
  font-weight: 400;
  src: url(https://fonts.gstatic.com/s/fraunces/v1/ext.woff2) format('woff2');
  unicode-range: U+0100-02BA;
}
/* latin */
@font-face {
  font-family: 'Fraunces';
  font-style: normal;
  font-weight: 400;
  src: url(https://fonts.gstatic.com/s/fraunces/v1/latin.woff2) format('woff2');
  unicode-range: U+0000-00FF;
}
/* latin */
@font-face {
  font-family: 'Fraunces';
  font-style: italic;
  font-weight: 700;
  src: url(https://fonts.gstatic.com/s/fraunces/v1/latin-italic.woff2) format('woff2');
}`;

describe("Google Fonts stylesheets", () => {
  it("give the Latin faces only, with their style and weight", () => {
    expect(latinFaces(SHEET)).toEqual([
      { style: "normal", weight: "400", url: "https://fonts.gstatic.com/s/fraunces/v1/latin.woff2" },
      { style: "italic", weight: "700", url: "https://fonts.gstatic.com/s/fraunces/v1/latin-italic.woff2" },
    ]);
  });
});
