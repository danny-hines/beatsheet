// Entry point the renderer bundles. The studio uses BeatsheetVideo directly through the Player.
import { STAGE_IDS, type Project } from "@beatsheet/schema";
import { Composition, registerRoot } from "remotion";
import { BeatsheetVideo, metadataFor, type VideoProps } from "./BeatsheetVideo.tsx";

const empty: Project = {
  id: "empty",
  title: "Empty",
  sources: [],
  cut: { id: "main", name: "Main cut" },
  recipe: "montage",
  spec: {},
  brief: { goal: "" },
  formats: [{ id: "vertical", label: "9:16", width: 1080, height: 1920, fps: 30 }],
  stages: Object.fromEntries(STAGE_IDS.map((s) => [s, { status: "todo" }])) as Project["stages"],
  spine: "shots",
  assets: [],
  tracks: [],
  shots: [],
  notes: [],
};
const defaults: VideoProps = { project: empty, format: "vertical", mediaBase: "", quality: "original" };

const Root: React.FC = () => (
  <Composition
    id="beatsheet"
    component={BeatsheetVideo}
    defaultProps={defaults}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={30}
    calculateMetadata={({ props }) => metadataFor(props)}
  />
);

registerRoot(Root);
