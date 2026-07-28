export const USE_DEMO = import.meta.env.VITE_USE_DEMO === 'true';


export const DEMO_ROUTE: [number, number, number][] = [
  [26.760600, 83.373200, 0],   // Gorakhpur (Origin)

  [26.814800, 82.727400, 2],   // Basti (halt)

  [26.792200, 82.199800, 3],   // Ayodhya (halt)

  [26.846700, 80.946200, 3],   // Lucknow (halt)

  [26.449900, 80.331900, 2],   // Kanpur (halt)

  [26.617700, 79.673700, 0],   // near Bharthana (pass-through, no halt)

  [26.785500, 79.015400, 2],   // Etawah (halt)

  [26.981100, 78.511800, 0],   // near Bah (pass-through, no halt)

  [27.176700, 78.008100, 3],   // Agra (halt)

  [27.492400, 77.673700, 2],   // Mathura (halt)

  [28.408900, 77.317800, 2],   // Faridabad (halt)

  [28.613900, 77.209000, 3],   // Delhi (destination)
];