# ECG CSV format

The application accepts comma-, semicolon-, or tab-separated text files.

Recommended format:

```csv
time,amplitude
0.000,0.012
0.004,0.018
0.008,0.021
```

The time column must be in seconds and increase uniformly. The application infers sampling frequency from the median time difference.

For a file with only an `amplitude`, `ecg`, `signal`, or `lead` column, enter the sampling frequency in the interface before analysis.

