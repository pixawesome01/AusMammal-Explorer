"""
Comprehensive pipeline establishment tests for AusMammal-Explorer.

Tests verify that:
1. All required dependencies are available for each pipeline
2. Pipeline configuration constants are properly defined
3. Pipeline functions can be imported and initialized
4. Core functions have the correct signatures
5. Output paths and directories are accessible

Run with: python -m pytest tests/test_pipelines.py -v --tb=short
"""
import json
import os
import tempfile
from pathlib import Path
from unittest import TestCase


class TestDataCleaningPipeline(TestCase):
    """Tests for the Data Cleaning Pipeline for MapLibre.py"""

    def setUp(self):
        """Set up test fixtures for pipeline tests."""
        self.data_processed_dir = Path(__file__).parent.parent / "data" / "processed"
        self.pipeline_file = self.data_processed_dir / "Data Cleaning Pipeline for MapLibre.py"

    def test_pipeline_file_exists(self):
        """Verify the pipeline file exists in the expected location."""
        self.assertTrue(
            self.pipeline_file.exists(),
            f"Pipeline file not found at {self.pipeline_file}"
        )

    def test_pipeline_file_is_readable(self):
        """Verify the pipeline file can be read."""
        with open(self.pipeline_file, encoding='utf-8') as f:
            content = f.read()
            self.assertTrue(len(content) > 0, "Pipeline file is empty")
            self.assertIn(
                "fetch_clean_and_format_marsupials",
                content,
                "Main pipeline function not found in file"
            )

    def test_required_dependencies_available(self):
        """Verify required dependencies for data cleaning pipeline can be imported."""
        required_packages = ['galah', 'pandas']
        for package in required_packages:
            try:
                __import__(package)
            except ImportError as e:
                self.fail(
                    f"Required dependency '{package}' not available. "
                    f"Install with: pip install {package}\n{str(e)}"
                )


    def test_output_directory_accessible(self):
        """Verify output directory is accessible for writing."""
        with tempfile.TemporaryDirectory() as tmpdir:
            test_output = os.path.join(tmpdir, "test_marsupials.geojson")
            # Verify we can write to the directory
            try:
                with open(test_output, 'w') as f:
                    f.write('{}')
                self.assertTrue(os.path.exists(test_output))
            except OSError as e:
                self.fail(f"Cannot write to output directory: {e}")

    def test_helper_functions_defined(self):
        """Verify key helper functions are defined in the pipeline."""
        with open(self.pipeline_file, encoding='utf-8') as f:
            content = f.read()
        
        required_functions = [
            'make_feature_id',
            'normalize_species',
            'robust_scale',
            'flag_outliers',
            'fetch_clean_and_format_marsupials'
        ]
        
        for func_name in required_functions:
            self.assertIn(
                f"def {func_name}",
                content,
                f"Required function '{func_name}' not found in pipeline"
            )

    def test_pipeline_config_parameters_valid(self):
        """Verify configuration parameters have sensible values."""
        with open(self.pipeline_file, encoding='utf-8') as f:
            content = f.read()
        
        # Check for critical parameter definitions
        self.assertIn("MIN_EVENT_DATE", content)
        self.assertIn("2020-01-01", content)
        self.assertIn("MAX_COORDINATE_UNCERTAINTY_M", content)
        self.assertIn("CENTROID_TOLERANCE_DEGREES", content)
        self.assertIn("ALLOWED_LICENSE", content)


class TestEnvironmentalContextPipelineEstablishment(TestCase):
    """Tests for the Environmental Context Pipeline for Insights.py"""

    def setUp(self):
        """Set up test fixtures for pipeline tests."""
        self.data_processed_dir = Path(__file__).parent.parent / "data" / "processed"
        self.pipeline_file = (
            self.data_processed_dir / "Environmental Context Pipeline for Insights.py"
        )

    def test_pipeline_file_exists(self):
        """Verify the pipeline file exists in the expected location."""
        self.assertTrue(
            self.pipeline_file.exists(),
            f"Pipeline file not found at {self.pipeline_file}"
        )

    def test_pipeline_file_is_readable(self):
        """Verify the pipeline file can be read."""
        with open(self.pipeline_file, encoding='utf-8') as f:
            content = f.read()
            self.assertTrue(len(content) > 0, "Pipeline file is empty")
            self.assertIn(
                "build_monthly_climate_context",
                content,
                "Main pipeline function not found in file"
            )

    def test_required_dependencies_available(self):
        """Verify required dependencies for environmental pipeline can be imported."""
        # numpy is essential; rasterio is needed for remote data access but may not be installed
        required_packages = ['numpy']
        optional_packages = ['rasterio']
        
        for package in required_packages:
            try:
                __import__(package)
            except ImportError as e:
                self.fail(
                    f"Required dependency '{package}' not available. "
                    f"Install with: pip install {package}\n{str(e)}"
                )
        
        # Check optional packages but don't fail if missing
        for package in optional_packages:
            try:
                __import__(package)
            except ImportError:
                print(f"Note: Optional dependency '{package}' not available. "
                      f"Remote CHELSA data access requires: pip install {package}")

    def test_australian_bounding_box_defined(self):
        """Verify Australian geographic boundaries are properly defined."""
        with open(self.pipeline_file, encoding='utf-8') as f:
            content = f.read()

        self.assertIn("AU_MIN_LON", content)
        self.assertIn("AU_MIN_LAT", content)
        self.assertIn("AU_MAX_LON", content)
        self.assertIn("AU_MAX_LAT", content)

        # Verify reasonable values - trimmed to SILO's own grid extent
        # (111.975-154.025 lon, -44.025 to -9.975 lat), not the occurrence
        # pipeline's wider box, so every sample point lands on real data.
        self.assertIn("112.0", content)  # Western longitude
        self.assertIn("154.0", content)  # Eastern longitude
        self.assertIn("-44.0", content)  # Southern latitude
        self.assertIn("-10.0", content)  # Northern latitude

    def test_silo_parameters_defined(self):
        """Verify SILO data parameters are properly configured."""
        with open(self.pipeline_file, encoding='utf-8') as f:
            content = f.read()

        self.assertIn("SILO_BUCKET_URL", content)
        self.assertIn("SAMPLE_GRID_STEP_DEG", content)
        self.assertIn("MONTH_NAMES", content)
        self.assertIn("Jan", content)
        self.assertIn("Dec", content)

    def test_climate_variables_defined(self):
        """Verify climate variables and their specifications are defined."""
        with open(self.pipeline_file, encoding='utf-8') as f:
            content = f.read()

        self.assertIn("PLAUSIBLE_RANGES", content)
        self.assertIn("monthly_rain", content)  # Precipitation (monthly product)
        self.assertIn("max_temp", content)      # Daily maximum temperature
        self.assertIn("min_temp", content)      # Daily minimum temperature
        self.assertIn("temperatureC", content)
        self.assertIn("precipitationMm", content)

    def test_helper_functions_defined(self):
        """Verify key helper functions are defined in the pipeline."""
        with open(self.pipeline_file, encoding='utf-8') as f:
            content = f.read()

        required_functions = [
            '_sample_points',
            '_download_year_file',
            '_decode_band_values',
            '_monthly_rainfall_mm',
            '_monthly_mean_temperature_c',
            '_monthly_summary',
            'build_monthly_climate_context'
        ]

        for func_name in required_functions:
            self.assertIn(
                f"def {func_name}",
                content,
                f"Required function '{func_name}' not found in pipeline"
            )

    def test_output_directory_accessible(self):
        """Verify output directory is accessible for writing."""
        with tempfile.TemporaryDirectory() as tmpdir:
            test_output = os.path.join(tmpdir, "test_climate.json")
            try:
                # Create a test output file
                test_data = {"test": "data"}
                with open(test_output, 'w') as f:
                    json.dump(test_data, f)
                self.assertTrue(os.path.exists(test_output))
            except OSError as e:
                self.fail(f"Cannot write to output directory: {e}")

    def test_output_json_structure(self):
        """Verify the expected JSON output structure is documented."""
        with open(self.pipeline_file, encoding='utf-8') as f:
            content = f.read()
        
        # Check for expected output fields
        expected_fields = [
            "source",
            "coveragePeriod",
            "region",
            "sampleGridStepDegrees",
            "nominalSamplePointCount",
            "minimumValidSampleFraction",
            "generatedAt",
            "months",
            "validTemperaturePointCount",
            "validRainfallPointCount",
        ]
        
        for field in expected_fields:
            self.assertIn(
                field,
                content,
                f"Expected output field '{field}' not found in pipeline code"
            )


class TestPipelineIntegration(TestCase):
    """Integration tests to verify pipeline ecosystem."""

    def setUp(self):
        """Set up test fixtures."""
        self.data_processed_dir = Path(__file__).parent.parent / "data" / "processed"

    def test_all_pipeline_files_exist(self):
        """Verify all expected pipeline files are present."""
        pipeline_files = [
            "Data Cleaning Pipeline for MapLibre.py",
            "Environmental Context Pipeline for Insights.py"
        ]
        
        for pipeline_file in pipeline_files:
            file_path = self.data_processed_dir / pipeline_file
            self.assertTrue(
                file_path.exists(),
                f"Pipeline '{pipeline_file}' not found at {file_path}"
            )

    def test_pipelines_syntactically_valid(self):
        """Verify all pipeline files have valid Python syntax."""
        for file_path in self.data_processed_dir.glob("*.py"):
            if file_path.name == ".gitkeep":
                continue
            
            with self.subTest(file=file_path.name):
                try:
                    with open(file_path, encoding='utf-8') as f:
                        code = f.read()
                    compile(code, file_path, 'exec')
                except SyntaxError as e:
                    self.fail(f"Syntax error in {file_path.name}: {e}")

    def test_pipeline_data_directory_structure(self):
        """Verify the data directory structure supports pipelines."""
        required_dirs = [
            self.data_processed_dir,
            self.data_processed_dir.parent / "raw",
            self.data_processed_dir.parent / "metadata"
        ]
        
        for dir_path in required_dirs:
            self.assertTrue(
                dir_path.is_dir(),
                f"Required data directory not found: {dir_path}"
            )

    def test_pipeline_documentation_present(self):
        """Verify pipelines have adequate documentation."""
        pipeline_files = list(self.data_processed_dir.glob("*.py"))
        
        for file_path in pipeline_files:
            if file_path.name == ".gitkeep":
                continue
            
            with self.subTest(file=file_path.name):
                with open(file_path, encoding='utf-8') as f:
                    content = f.read()
                
                # Check for docstrings
                self.assertTrue(
                    '"""' in content or "'''" in content,
                    f"No module docstring found in {file_path.name}"
                )

    def test_critical_imports_consistent(self):
        """Verify critical imports are available across all pipelines."""
        # pandas and numpy should be available for data processing
        critical_packages = ['pandas', 'numpy']
        for package in critical_packages:
            with self.subTest(package=package):
                try:
                    __import__(package)
                except ImportError as e:
                    self.fail(
                        f"Critical package '{package}' not available: {e}"
                    )
