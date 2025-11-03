/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#f4f4f5",
        ink: "#0a0a0a",
        mute: "#a1a1aa",
        card: "#ffffff"
      },
      borderRadius: {
        xl2: "1.25rem"
      },
      boxShadow: {
        soft: "0 6px 24px rgba(0,0,0,0.06)",
        ring: "0 0 0 2px #0a0a0a"
      }
    }
  },
  plugins: []
};
