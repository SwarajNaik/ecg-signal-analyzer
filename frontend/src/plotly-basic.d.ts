declare module "plotly.js-basic-dist-min" {
  import Plotly from "plotly.js";
  export default Plotly;
}

declare module "*.py?raw" {
  const source: string;
  export default source;
}
