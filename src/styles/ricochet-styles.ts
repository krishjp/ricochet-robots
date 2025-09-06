// A centralized file for all Tailwind CSS class strings used in the game.

export const colors = {
    red: { text: 'text-red-600', border: 'border-red-600', target: 'text-red-500' },
    blue: { text: 'text-blue-600', border: 'border-blue-600', target: 'text-blue-500' },
    green: { text: 'text-green-600', border: 'border-green-600', target: 'text-green-500' },
    yellow: { text: 'text-yellow-500', border: 'border-yellow-500', target: 'text-yellow-400' },
};

export const styles = {
    // Main Layout
    mainContainer: "flex flex-col lg:flex-row items-center justify-center min-h-screen bg-slate-100 p-4 gap-8 text-slate-800",
    loadingContainer: "flex items-center justify-center min-h-screen bg-slate-100 text-slate-800",
    loadingSpinner: "w-16 h-16 animate-spin text-slate-500",

    // Board
    boardContainer: "grid grid-cols-16 border-2 border-slate-400 aspect-square w-full max-w-lg lg:max-w-xl xl:max-w-2xl bg-white shadow-2xl",
    cell: "aspect-square flex items-center justify-center relative",
    
    // Game Pieces
    robot: (color: keyof typeof colors, isSelected: boolean) => 
        `w-full h-full p-0.5 transition-transform duration-200 ${colors[color].text} ${isSelected ? `scale-110 -translate-y-1 border-2 ${colors[color].border} rounded-full` : ''}`,
    target: (color: keyof typeof colors) => `w-3/4 h-3/4 ${colors[color].target}`,
    moveIndicator: "absolute w-1/3 h-1/3 bg-yellow-400/70 rounded-full cursor-pointer animate-pulse",

    // Optimal Path Number Display
    optimalStepContainer: "absolute inset-0 flex items-start justify-start pointer-events-none z-10",
    optimalStepBubble: "flex items-center justify-center w-2/5 h-2/5 aspect-square bg-black/75 text-white text-xs font-bold rounded-full ring-2 ring-white transform -translate-x+3/2 -translate-y+3/2",

    // UI Panel
    panelContainer: "w-full lg:w-80 flex flex-col gap-4",
    panelCard: "p-4 bg-white rounded-lg shadow-lg border",
    panelTitle: "text-xl font-semibold mb-2",
    
    // Buttons
    buttonBase: "p-2 rounded-lg flex items-center justify-center gap-2 transition-colors focus:outline-none",
    buttonBlue: "bg-blue-600 text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-400",
    buttonGreen: "bg-green-600 text-white hover:bg-green-700 focus:ring-2 focus:ring-green-400",
    buttonPurple: "bg-purple-600 text-white hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed focus:ring-2 focus:ring-purple-400",
};

