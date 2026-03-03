/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        gh: {
          bg: "#0d1117",
          panel: "#161b22",
          panelAlt: "#0b1320",
          text: "#c9d1d9",
          muted: "#8b949e",
          border: "#30363d",
          topbar: "#010409",
          accent: "#2f81f7",
          danger: "#f85149",
          success: "#238636",
          warning: "#d29922",
          button: "#21262d"
        }
      }
    }
  },
  plugins: []
};
