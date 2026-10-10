console.error('Production publishing is restricted to the gated main GitHub Actions workflow. Push a reviewed PR and release through CI.');
process.exitCode = 1;
