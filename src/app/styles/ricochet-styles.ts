// A centralized file for all Tailwind CSS class strings used in the game.

export const ANIMATION_SPEED_MS = 550;

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
    robotContainer: "absolute transition-all ease-in-out duration-200",
    robotIcon: (color: keyof typeof colors, isSelected: boolean) => 
        `w-full h-full transition-transform duration-200 ${colors[color].text} ${isSelected ? 'scale-110' : ''}`,
    target: (color: keyof typeof colors) => `w-3/4 h-3/4 ${colors[color].target}`,
    moveIndicator: "absolute w-1/3 h-1/3 bg-yellow-400/70 rounded-full cursor-pointer animate-pulse",

    // UI Panel
    panelContainer: "w-full lg:w-80 flex flex-col gap-4",
    panelCard: "p-4 bg-white rounded-lg shadow-lg border",
    panelTitle: "text-xl font-semibold mb-2",
    
    // Buttons
    buttonBase: "p-2 rounded-lg flex items-center justify-center gap-2 transition-colors focus:outline-none",
    buttonBlue: "bg-blue-600 text-white hover:bg-blue-700 focus:ring-2 focus:ring-blue-400",
    buttonGreen: "bg-green-600 text-white hover:bg-green-700 focus:ring-2 focus:ring-green-400",
    buttonPurple: "bg-purple-600 text-white hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed focus:ring-2 focus:ring-purple-400",
    buttonRed: "bg-red-600 text-white hover:bg-red-700 focus:ring-2 focus:ring-red-400",
    buttonSlate: "bg-slate-600 text-white hover:bg-slate-700 focus:ring-2 focus:ring-slate-400",
    buttonDisabled: "disabled:bg-gray-400 disabled:cursor-not-allowed",
    input: "bg-white border border-slate-300 px-2 py-1 rounded-md text-sm min-w-0",

    // Lobby entry
    landingContainer: "flex flex-col items-center justify-center min-h-[calc(100vh-4rem)] bg-slate-100 p-4 gap-8 text-slate-800",

    // Multiplayer
    boardPlaceholder: "absolute inset-0 flex flex-col items-center justify-center gap-4 border-2 border-slate-400 bg-white shadow-2xl text-slate-500 text-center p-4",
    notice: "p-3 rounded-lg bg-amber-100 border border-amber-300 text-amber-900 text-sm flex justify-between items-start gap-2",
    countdown: "text-4xl font-black tabular-nums",
    solvedBanner: "absolute top-4 left-1/2 -translate-x-1/2 z-10 pointer-events-none flex items-center gap-2 whitespace-nowrap px-4 py-2 rounded-full bg-green-600 text-white font-bold shadow-xl animate-pulse",
    playerRow: "flex items-center gap-2 py-1.5 px-2 rounded-md",
    playerRowActive: "bg-amber-100",
    bidBadge: "ml-auto text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 tabular-nums",
    bidBadgeFailed: "line-through opacity-60",
};