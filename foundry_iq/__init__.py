"""Foundry IQ knowledge retrieval backend (Azure AI Search).

This package provides the same query surface as ``vector_store.qdrant_store``
so it can be swapped in via ``config.RETRIEVAL_PROVIDER=foundry_iq``. Azure AI
Search is the vector/semantic engine that backs Microsoft Foundry IQ knowledge
bases, and returns grounded results with citation metadata.
"""
