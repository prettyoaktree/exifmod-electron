# Status bar chevron icons

Current state: point to the right when popup panel is collapsed (default state)

New state: point up to better indicate the location of where the panel will open

Keep chevron pointed down when panel is open to indicate direction of collapse

# Progress indicator when generating desc/keywords

When generating descriptions and keywords for one or more files, we should display overall progress in the status bar. 

1. While generation is in progress, pulse the status icon using the same pattern as when loading / looking for Ollama
2. Whiel generation is in progress, the popup panel should show a message like "Generating description and keywords for X of Y files...". Update with progress. The popip panel should not automatically reopen while generation is in progress as the pulsing status light will already provide an indication to the user.
3. When generation complete, open the popup panel and display a completion message.

