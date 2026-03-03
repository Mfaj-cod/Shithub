from setuptools import setup, find_packages

setup(
    name="shithub",
    version="0.1",
    packages=find_packages(),
    install_requires=[
        "typer",
        "requests"
    ],
    entry_points={
        "console_scripts": [
            "shithub=cli.main:app"
        ],
    },
)
