from setuptools import setup

# setup.py lives inside the package dir, so point the package at current dir
setup(
    name="qa_browseruse_mcp",
    version="0.1.0",
    packages=["qa_browseruse_mcp"],
    package_dir={"qa_browseruse_mcp": "."},
    install_requires=[
        "playwright>=1.40.0",
        "pydantic>=2.0.0",
    ],
    extras_require={
        "server": ["fastapi>=0.100.0", "aiohttp>=3.9.0"],
    },
)
