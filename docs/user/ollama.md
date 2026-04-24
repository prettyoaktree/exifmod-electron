# Ollama and AI

If you want **short descriptions and keyword ideas** from an image, EXIFmod can use a **local** model so nothing is sent to a random cloud. That’s done with **[Ollama](https://ollama.com/)** — the same stack many people use to run open models on their own machine.

Out of the box, EXIFmod expects a model called **`gemma4`**, which is tuned for a good mix of image understanding and speed on typical hardware.

## 1. Install Ollama

- **Any platform:** get the installer from **[ollama.com](https://ollama.com/)** and follow their steps.
- **Mac with Homebrew:** you can also run:

  ```bash
  brew install ollama
  ```

  (If the formula name ever changes, check Ollama’s current install page.)

Ollama needs to be **running** on your machine. Usually that means the `ollama` service. EXIFmod talks to it on the default local address. If the app finds the `ollama` tool but the server isn’t up, you may get a nudge to start it — you can also run `ollama serve` yourself in a terminal if you like doing things by hand.

## 2. Pull the default model

In a terminal:

```bash
ollama pull gemma4
```

That downloads the model EXIFmod’s defaults expect. It can take a while the first time, depending on your connection.

## 3. Using it inside EXIFmod

Once Ollama is up and the model is pulled, use the in-app **AI** controls to generate or refine **descriptions** and **keywords** from the current image. If the wording feels too short, long, generic, or specific, you can adjust the **system prompt** in the app **carefully** — a bad prompt can make the output worse. If you break it, EXIFmod can **reset the system prompt to the default**.

## Advanced (optional)

You usually don’t need this.

- If you use a **different model name**, you can set the environment variable **`EXIFMOD_OLLAMA_MODEL`** before starting EXIFmod.
- If Ollama listens on a **non-default host or port**, use **`EXIFMOD_OLLAMA_HOST`**.

Only change these if you know why you’re changing them. Everyone else is fine with the defaults above.
