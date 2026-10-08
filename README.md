Custom-Theme Sudoku

A full-stack Sudoku web app where you pick a theme and AI generates the game tiles for it. Instead of the digits 1–9, play with [e.g., nine images or symbols that match your theme].

Live demo: https://sudokuproj-production.up.railway.app/

Features
Enter any theme and get a matching custom tile set generated on demand
Playable Sudoku board with [puzzle generation, move validation, hints, etc. — list what's actually built]
Secure backend that keeps third-party API keys off the client
How it works
Browser (JavaScript)  -->  Express.js server (Railway)  -->  Claude API
                                     |
                                     +--------------------->  Pollinations AI
The user enters a theme in the frontend.
The frontend sends the theme to the Express backend.
The backend calls Claude and Pollinations AI with the server-side API keys and returns the generated tiles.
The frontend renders the themed tiles on the Sudoku board.

Why a backend? Calling these APIs directly from the browser would expose the private keys in client code and run into CORS restrictions. The Express server acts as a proxy, so keys stay server-side.

Tech stack
Frontend: JavaScript, HTML, CSS
Backend: Node.js, Express.js
AI services: Claude API, Pollinations AI
Hosting: Railway
Getting started
Prerequisites
Node.js 
An API key for Anthropic.
