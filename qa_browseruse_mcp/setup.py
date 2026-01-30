from setuptools import setup, find_packages

setup(
    name="qa_browseruse_mcp",
    version="0.1.0",
    packages=find_packages(),
    install_requires=[
        "playwright>=1.40.0",
        "pydantic>=2.0.0",
    ],
    extras_require={
        "server": ["fastapi>=0.100.0", "aiohttp>=3.9.0"],
    },
)
